const { ethers } = require("hardhat");
const { loadAddrs } = require("./lib");

async function main() {
  const addrs = loadAddrs();

  // Get token ID from environment or arguments
  const tokenId = Number(process.env.TOKEN_ID || process.argv[2] || 1);

  // Connect to contracts
  const reg = await ethers.getContractAt("VaccineRegistry", addrs.registry);
  const token = await ethers.getContractAt("BatchToken", addrs.batchToken);

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`          VACCINE BATCH TIMELINE - TOKEN ID ${tokenId}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Get current batch state
  const batch = await reg.getBatch(tokenId);
  
  // Print current snapshot
  await printSnapshot(batch, tokenId, addrs);

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("                     EVENT TIMELINE");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Query all events for this token
  await printEventTimeline(reg, token, tokenId, addrs);

  console.log("\n═══════════════════════════════════════════════════════════════\n");
}

async function printSnapshot(batch, tokenId, addrs) {
  console.log(" CURRENT BATCH SNAPSHOT");
  console.log("─────────────────────────────────────────────────────────────\n");

  // Basic info
  console.log(`Lot Number:        ${batch.lot}`);
  console.log(`Status:            ${getStatusName(Number(batch.status))} (${batch.status})`);
  console.log(`Current Custodian: ${batch.currentCustodian}`);
  console.log(`                   ${getRoleName(batch.currentCustodian, addrs)}`);

  // Temperature specs
  console.log(`\nTemperature Range: ${Number(batch.tempMinTimes10) / 10}°C to ${Number(batch.tempMaxTimes10) / 10}°C`);
  console.log(`Breach Status:     ${batch.breach ? "⚠️  BREACHED" : "✓ No breaches"}`);
  if (batch.breach && Number(batch.firstBreachAt) > 0) {
    console.log(`First Breach At:   ${formatTimestamp(batch.firstBreachAt)}`);
  }

  // Expiry
  console.log(`\nExpiry Date:       ${formatTimestamp(batch.expiry)}`);
  const now = Math.floor(Date.now() / 1000);
  const daysUntilExpiry = Math.floor((Number(batch.expiry) - now) / 86400);
  if (daysUntilExpiry > 0) {
    console.log(`                   (${daysUntilExpiry} days remaining)`);
  } else {
    console.log(`                   ⚠️  EXPIRED`);
  }

  // Recall status
  console.log(`\nRecall Status:     ${batch.recalled ? "🚨 RECALLED" : "✓ Active"}`);
  if (batch.recalled && batch.recallReasonCID) {
    console.log(`Recall Reason CID: ${batch.recallReasonCID}`);
    console.log(`Recall Set At:     ${formatTimestamp(batch.recallSetAt)}`);
    if (batch.recallReasonCID.startsWith("bafk")) {
      console.log(`IPFS Link:         https://${batch.recallReasonCID}.ipfs.w3s.link/`);
    }
  }
}

async function printEventTimeline(reg, token, tokenId, addrs) {
  const events = [];

  // Get all events from both contracts
  const registryFilter = reg.filters;
  const tokenFilter = token.filters;

  // Query BatchRegistered events
  try {
    const batchRegistered = await reg.queryFilter(
      registryFilter.BatchRegistered(tokenId),
      0,
      "latest"
    );
    for (const event of batchRegistered) {
      const block = await event.getBlock();
      events.push({
        timestamp: block.timestamp,
        blockNumber: event.blockNumber,
        type: "BatchRegistered",
        data: {
          lot: event.args.lot,
          expiry: event.args.expiry,
          tempMin: Number(event.args.tempMinTimes10) / 10,
          tempMax: Number(event.args.tempMaxTimes10) / 10
        }
      });
    }
  } catch (e) {
    // Event might not exist
  }

  // Query StatusUpdated events
  try {
    const statusUpdated = await reg.queryFilter(
      registryFilter.StatusUpdated(tokenId),
      0,
      "latest"
    );
    for (const event of statusUpdated) {
      const block = await event.getBlock();
      events.push({
        timestamp: block.timestamp,
        blockNumber: event.blockNumber,
        type: "StatusUpdated",
        data: {
          status: getStatusName(Number(event.args.next)),
          statusNum: Number(event.args.next),
          actor: event.args.actor,
          actorRole: getRoleName(event.args.actor, addrs)
        }
      });
    }
  } catch (e) {}

  // Query Transfer events (custody changes)
  try {
    const transfers = await token.queryFilter(
      tokenFilter.Transfer(null, null, tokenId),
      0,
      "latest"
    );
    for (const event of transfers) {
      const block = await event.getBlock();
      // Skip mint event (from zero address)
      if (event.args.from !== ethers.ZeroAddress) {
        events.push({
          timestamp: block.timestamp,
          blockNumber: event.blockNumber,
          type: "Transfer",
          data: {
            from: event.args.from,
            fromRole: getRoleName(event.args.from, addrs),
            to: event.args.to,
            toRole: getRoleName(event.args.to, addrs)
          }
        });
      }
    }
  } catch (e) {}

  // Query TemperatureEvent events
  try {
    const tempEvents = await reg.queryFilter(
      registryFilter.TemperatureEvent(tokenId),
      0,
      "latest"
    );
    for (const event of tempEvents) {
      const block = await event.getBlock();
      events.push({
        timestamp: block.timestamp,
        blockNumber: event.blockNumber,
        type: "TemperatureEvent",
        data: {
          temp: Number(event.args.cTimes10) / 10,
          isBreach: event.args.isBreach,
          timestamp: event.args.at
        }
      });
    }
  } catch (e) {}

  // Query DocumentPinned events
  try {
    const docPinned = await reg.queryFilter(
      registryFilter.DocumentPinned(tokenId),
      0,
      "latest"
    );
    for (const event of docPinned) {
      const block = await event.getBlock();
      events.push({
        timestamp: block.timestamp,
        blockNumber: event.blockNumber,
        type: "DocumentPinned",
        data: {
          docType: event.args.docType,
          cid: event.args.cid
        }
      });
    }
  } catch (e) {}

  // Query RecallSet events
  try {
    const recallEvents = await reg.queryFilter(
      registryFilter.RecallSet(tokenId),
      0,
      "latest"
    );
    for (const event of recallEvents) {
      const block = await event.getBlock();
      events.push({
        timestamp: block.timestamp,
        blockNumber: event.blockNumber,
        type: "RecallSet",
        data: {
          recalled: event.args.recalled,
          reasonCID: event.args.reasonCID,
          timestamp: event.args.at
        }
      });
    }
  } catch (e) {}

  // Sort events by timestamp
  events.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

  // Print timeline
  if (events.length === 0) {
    console.log("No events found for this token.");
    return;
  }

  events.forEach((event, index) => {
    console.log(`${index + 1}. [${formatTimestamp(event.timestamp)}] Block ${event.blockNumber}`);
    
    switch (event.type) {
      case "BatchRegistered":
        console.log(`    Batch Registered`);
        console.log(`      Lot: ${event.data.lot}`);
        console.log(`      Temp Range: ${event.data.tempMin}°C to ${event.data.tempMax}°C`);
        console.log(`      Expiry: ${formatTimestamp(event.data.expiry)}`);
        break;

      case "StatusUpdated":
        console.log(`    Status Updated → ${event.data.status}`);
        console.log(`      Actor: ${event.data.actor}`);
        console.log(`      Role: ${event.data.actorRole}`);
        break;

      case "Transfer":
        console.log(`    Custody Transfer`);
        console.log(`      From: ${event.data.from} (${event.data.fromRole})`);
        console.log(`      To: ${event.data.to} (${event.data.toRole})`);
        break;

      case "TemperatureEvent":
        console.log(`     Temperature Reading: ${event.data.temp}°C`);
        console.log(`      ${event.data.isBreach ? "⚠️  BREACH DETECTED" : "✓ Within range"}`);
        break;

      case "DocumentPinned":
        console.log(`    Document Pinned`);
        console.log(`      Type: ${event.data.docType}`);
        console.log(`      CID: ${event.data.cid}`);
        break;

      case "RecallSet":
        console.log(`   ${event.data.recalled ? "🚨 RECALL ISSUED" : "✅ RECALL CLEARED"}`);
        if (event.data.reasonCID) {
          console.log(`      Reason CID: ${event.data.reasonCID}`);
        }
        break;
    }
    console.log();
  });

  console.log(`Total Events: ${events.length}`);
}

// Helper functions
function getStatusName(status) {
  const statuses = [
    "Manufactured",
    "QAReleased",
    "Shipped",
    "Received",
    "InStorage",
    "Consumed"
  ];
  return statuses[Number(status)] || "Unknown";
}

function getRoleName(address, addrs) {
  const addr = address.toLowerCase();
  if (addr === addrs.accounts.manufacturer.toLowerCase()) return "Manufacturer";
  if (addr === addrs.accounts.distributor.toLowerCase()) return "Distributor";
  if (addr === addrs.accounts.clinic.toLowerCase()) return "Clinic";
  if (addr === addrs.accounts.regulator.toLowerCase()) return "Regulator";
  if (addr === addrs.accounts.oracle.toLowerCase()) return "Oracle";
  if (addr === addrs.accounts.deployer.toLowerCase()) return "Deployer/Admin";
  return "Unknown";
}

function formatTimestamp(ts) {
  const date = new Date(Number(ts) * 1000);
  return date.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

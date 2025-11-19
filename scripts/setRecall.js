const { ethers } = require("hardhat");
const { loadAddrs } = require("./lib");

async function main() {
  const addrs = loadAddrs();

  // Get token ID from environment or arguments
  const tokenId = Number(process.env.TOKEN_ID || process.argv[2] || 1);
  
  // Get recall status: true to issue recall, false to clear it
  const recallStr = process.env.RECALLED || process.argv[3];
  
  if (recallStr === undefined) {
    throw new Error(
      "Missing RECALLED. Example: TOKEN_ID=1 RECALLED=true REASON_CID=bafk... npx hardhat run scripts/setRecall.js --network localhost"
    );
  }

  const recalled = recallStr.toLowerCase() === "true";
  
  // Get reason CID (IPFS content identifier)
  // For clearing a recall, can use empty string
  const reasonCID = process.env.REASON_CID || process.argv[4] || "";

  if (recalled && !reasonCID) {
    throw new Error(
      "REASON_CID is required when issuing a recall (RECALLED=true). Upload reason document to IPFS first."
    );
  }

  // Get regulator signer (Account #4)
  const signers = await ethers.getSigners();
  const regulator = signers[4]; // Regulator is the 5th account (index 4)

  // Connect to VaccineRegistry as regulator
  const reg = await ethers.getContractAt(
    "VaccineRegistry",
    addrs.registry,
    regulator
  );

  // Get batch info before recall
  const batchBefore = await reg.getBatch(tokenId);
  const wasRecalled = batchBefore.recalled;

  console.log(`\n${recalled ? " ISSUING RECALL" : " CLEARING RECALL"} for Token ${tokenId} (${batchBefore.lot})`);
  console.log(`  Current custodian: ${batchBefore.currentCustodian}`);
  console.log(`  Current status: ${getStatusName(Number(batchBefore.status))}`);
  console.log(`  Previous recall state: ${wasRecalled ? "RECALLED" : "Active"}`);
  
  if (recalled) {
    console.log(`  Reason document: ${reasonCID}`);
    if (reasonCID.startsWith("bafk")) {
      console.log(`  IPFS link: https://${reasonCID}.ipfs.w3s.link/`);
    }
  }

  // Issue or clear the recall
  const tx = await reg.setRecall(tokenId, recalled, reasonCID);
  const rcpt = await tx.wait();

  // Get block timestamp (more reliable than event parsing)
  const block = await rcpt.getBlock();
  
  // Find the RecallSet event
  const recallEvent = rcpt.logs.find(l => l.fragment?.name === "RecallSet");
  
  if (recallEvent) {
    const eventRecalled = recallEvent.args.recalled;
    const eventReasonCID = recallEvent.args.reasonCID;
    
    console.log(`\n   Recall ${eventRecalled ? "ISSUED" : "CLEARED"} successfully`);
    console.log(`  Timestamp: ${new Date(Number(block.timestamp) * 1000).toISOString()}`);
    
    if (eventRecalled) {
      console.log(`  Reason CID: ${eventReasonCID}`);
      console.log(`\n    WARNING: This batch is now RECALLED`);
      console.log(`  Action required: Custodians should quarantine and await disposal instructions`);
    } else {
      console.log(`\n   Batch returned to normal operations`);
    }
  }

  console.log(`  Transaction hash: ${tx.hash}\n`);

  // Show updated batch state
  const batchAfter = await reg.getBatch(tokenId);
  console.log(`Updated batch state:`);
  console.log(`  Recalled: ${batchAfter.recalled}`);
  console.log(`  Recall reason CID: ${batchAfter.recallReasonCID || "N/A"}`);
  console.log(`  Recall timestamp: ${Number(batchAfter.recallSetAt) > 0 ? new Date(Number(batchAfter.recallSetAt) * 1000).toISOString() : "N/A"}\n`);
}

// Helper function to convert status enum to readable name
function getStatusName(status) {
  const statuses = [
    "Manufactured",
    "QAReleased", 
    "Shipped",
    "Received",
    "InStorage",
    "Consumed"
  ];
  return statuses[status] || "Unknown";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

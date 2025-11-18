const { ethers } = require("hardhat");
const { loadAddrs } = require("./lib");

async function main() {
  const addrs = loadAddrs();

  // Get token ID from environment or arguments
  const tokenId = Number(process.env.TOKEN_ID || process.argv[2] || 1);
  
  // Get temperature in Celsius from environment or arguments
  const tempCelsius = process.env.TEMP || process.argv[3];
  
  if (tempCelsius === undefined) {
    throw new Error(
      "Missing TEMP. Example: TOKEN_ID=1 TEMP=5.5 npx hardhat run scripts/recordTemp.js --network localhost"
    );
  }

  // Convert temperature to tenths (e.g., 5.5°C → 55)
  const tempFloat = parseFloat(tempCelsius);
  const cTimes10 = Math.round(tempFloat * 10);

  // Get oracle signer (Account #5)
  const signers = await ethers.getSigners();
  const oracle = signers[5]; // Oracle is the 6th account (index 5)

  // Connect to VaccineRegistry as oracle
  const reg = await ethers.getContractAt(
    "VaccineRegistry",
    addrs.registry,
    oracle
  );

  // Get batch info to show temperature range
  const batch = await reg.getBatch(tokenId);
  const minTemp = Number(batch.tempMinTimes10) / 10;
  const maxTemp = Number(batch.tempMaxTimes10) / 10;
  const wasBreach = batch.breach;

  console.log(`\nRecording temperature for Token ${tokenId} (${batch.lot})`);
  console.log(`  Acceptable range: ${minTemp}°C to ${maxTemp}°C`);
  console.log(`  Current reading: ${tempFloat}°C`);

  // Record the temperature
  const tx = await reg.recordTemp(tokenId, cTimes10);
  const rcpt = await tx.wait();

  // Find the TemperatureEvent to see if breach occurred
  const tempEvent = rcpt.logs.find(l => l.fragment?.name === "TemperatureEvent");
  
  if (tempEvent) {
    const isBreach = tempEvent.args.isBreach;
    const timestamp = tempEvent.args.at;
    
    console.log(`  Status: ${isBreach ? "  BREACH DETECTED" : " Within range"}`);
    
    // Use block timestamp instead if event timestamp is problematic
    const block = await rcpt.getBlock();
    console.log(`  Timestamp: ${new Date(Number(block.timestamp) * 1000).toISOString()}`);
    
    if (isBreach && !wasBreach) {
      console.log(`   FIRST BREACH - Batch permanently flagged!`);
    } else if (isBreach && wasBreach) {
      console.log(`    Breach continues (already flagged)`);
    }
  }

  console.log(`  Transaction hash: ${tx.hash}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

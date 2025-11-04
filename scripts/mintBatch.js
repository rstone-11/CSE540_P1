const { ethers } = require("hardhat");
const { loadAddrs } = require("./lib");

async function main() {
  const addrs = loadAddrs();
  const [, manufacturer] = await ethers.getSigners();

  const reg = await ethers.getContractAt("VaccineRegistry", addrs.registry, manufacturer);

  const lot     = process.env.LOT || process.argv[2] || "LOT-VAX-2025-001";
  const expiry  = Math.floor(Date.now()/1000) + 60*60*24*90;
  const min10   = 20;
  const max10   = 80;
  const metaHash = ethers.keccak256(ethers.toUtf8Bytes('{"name":"Demo"}'));
  const origin   = "Plant-01";

  const tx = await reg.mintBatch(lot, expiry, min10, max10, metaHash, origin);
  const rcpt = await tx.wait();
  const evt = rcpt.logs.find(l => l.fragment?.name === "BatchRegistered");
  console.log("Minted tokenId:", evt?.args?.tokenId?.toString(), "lot=", lot);
}
main().catch(e=>{console.error(e);process.exit(1);});

// NEXT is the Status enum index:
//   0 = Manufactured
//   1 = QAReleased
//   2 = Shipped
//   3 = Received
//   4 = InStorage
//   5 = Consumed

const { ethers } = require("hardhat");
const { loadAddrs } = require("./lib");

async function main() {
  const addrs = loadAddrs();

  const tokenId = Number(process.env.TOKEN_ID || process.argv[2] || 1);
  const nextRaw = process.env.NEXT ?? process.argv[3];
  if (nextRaw === undefined) {
    throw new Error(
      "Missing NEXT. Example: TOKEN_ID=1 NEXT=1 npx hardhat run scripts/updateStatus.js --network localhost"
    );
  }
  const next = Number(nextRaw);

  // Find current custodian by reading BatchToken.ownerOf(tokenId)
  const token = await ethers.getContractAt("BatchToken", addrs.batchToken);
  const owner = await token.ownerOf(tokenId);

  const signers = await ethers.getSigners();
  const custodian = signers.find(
    (s) => s.address.toLowerCase() === owner.toLowerCase()
  );
  if (!custodian) {
    throw new Error(`Could not find signer for current custodian ${owner}`);
  }

  const reg = await ethers.getContractAt(
    "VaccineRegistry",
    addrs.registry,
    custodian
  );

  const tx = await reg.updateStatus(tokenId, next);
  await tx.wait();

  console.log(
    `Updated token ${tokenId} to status enum value ${next} as ${custodian.address}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

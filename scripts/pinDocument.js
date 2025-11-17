const { ethers } = require("hardhat");
const { loadAddrs } = require("./lib");

async function main() {
  const addrs = loadAddrs();

  const tokenId = Number(process.env.TOKEN_ID || process.argv[2] || 1);
  const docTypeStr = (process.env.DOC_TYPE || process.argv[3] || "COA").toUpperCase();
  const cid = process.env.CID || process.argv[4];

  if (!cid) {
    throw new Error(
      "Missing CID. Example: TOKEN_ID=1 DOC_TYPE=MANIFEST CID=<> npx hardhat run scripts/pinDocument.js --network localhost"
    );
  }

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

  const docType = ethers.id(docTypeStr); // bytes32 hash of the label
  const tx = await reg.pinDocument(tokenId, docType, cid);
  await tx.wait();

  // Read back to confirm
  const storedCid = await reg.latestDocCid(tokenId, docType);
  console.log(
    `Pinned ${docTypeStr} CID on token ${tokenId}: ${storedCid}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

const { ethers } = require("hardhat");
const { loadAddrs } = require("./lib");

async function main() {
  const addrs = loadAddrs();

  const tokenId = Number(process.env.TOKEN_ID || process.argv[2] || 1);
  const toRole = (process.env.TO_ROLE || process.argv[3] || "").toLowerCase();
  const explicitTo = process.env.TO;

  let to;

  if (explicitTo) {
    to = explicitTo;
  } else if (toRole && addrs.accounts && addrs.accounts[toRole]) {
    to = addrs.accounts[toRole];
  } else {
    throw new Error(
      "Need TO (address) or TO_ROLE (manufacturer|distributor|clinic|regulator|oracle)"
    );
  }

  const token = await ethers.getContractAt("BatchToken", addrs.batchToken);

  // Find current owner to sign transfer
  const owner = await token.ownerOf(tokenId);
  const signers = await ethers.getSigners();
  const fromSigner = signers.find(
    (s) => s.address.toLowerCase() === owner.toLowerCase()
  );
  if (!fromSigner) {
    throw new Error(`Could not find signer for current owner ${owner}`);
  }

  const tokenFrom = token.connect(fromSigner);

  // Use full signature to avoid overload issues
  const tx = await tokenFrom["safeTransferFrom(address,address,uint256)"](
    owner,
    to,
    tokenId
  );
  await tx.wait();

  console.log(`Transferred token ${tokenId} from ${owner} to ${to}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

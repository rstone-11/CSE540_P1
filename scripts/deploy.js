const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer, manufacturer, distributor, clinic, regulator, oracle] =
    await ethers.getSigners();

  // Deploy BatchToken
  const BatchToken = await ethers.getContractFactory("BatchToken");
  const token = await BatchToken.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("BatchToken:", tokenAddr);

  // Deploy VaccineRegistry
  const Registry = await ethers.getContractFactory("VaccineRegistry");
  const reg = await Registry.deploy(deployer.address, tokenAddr);
  await reg.waitForDeployment();
  const regAddr = await reg.getAddress();
  console.log("VaccineRegistry:", regAddr);

  // Grant roles 
  const MANUFACTURER = ethers.id("MANUFACTURER");
  const DISTRIBUTOR  = ethers.id("DISTRIBUTOR");
  const CLINIC       = ethers.id("CLINIC");
  const REGULATOR    = ethers.id("REGULATOR");
  const ORACLE       = ethers.id("ORACLE_UPDATER");

  await (await reg.grantRole(MANUFACTURER, manufacturer.address)).wait();
  await (await reg.grantRole(DISTRIBUTOR,  distributor.address)).wait();
  await (await reg.grantRole(CLINIC,       clinic.address)).wait();
  await (await reg.grantRole(REGULATOR,    regulator.address)).wait();
  await (await reg.grantRole(ORACLE,       oracle.address)).wait();

  // Allow Registry to mint tokens in BatchToken
  const MINTER_ROLE = ethers.id("MINTER_ROLE");
  await (await token.grantRole(MINTER_ROLE, regAddr)).wait();

  // Write addresses.local.json so other scripts can find contracts
  const out = {
    network: "localhost",
    batchToken: tokenAddr,
    registry: regAddr,
    accounts: {
      deployer: deployer.address,
      manufacturer: manufacturer.address,
      distributor: distributor.address,
      clinic: clinic.address,
      regulator: regulator.address,
      oracle: oracle.address
    }
  };
  fs.writeFileSync("addresses.local.json", JSON.stringify(out, null, 2));
  console.log("Roles granted. Wrote addresses.local.json");
}

main().catch((e) => { console.error(e); process.exit(1); });

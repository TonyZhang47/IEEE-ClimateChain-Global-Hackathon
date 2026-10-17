const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account. Set DEPLOYER_PRIVATE_KEY or run against a Hardhat node.");
  }

  const factory = await hre.ethers.getContractFactory("HydroTrustVerifier");
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const network = await hre.ethers.provider.getNetwork();

  const record = {
    contract: "HydroTrustVerifier",
    address,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name || "chain"}-${network.chainId}.json`);
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);

  console.log(`HydroTrustVerifier deployed at ${address}`);
  console.log(`Chain ID ${record.chainId}`);
  console.log(`Wrote ${file}`);
  console.log(`Set NEXT_PUBLIC_HYDROTRUST_CONTRACT=${address}`);
  console.log(`Set NEXT_PUBLIC_CHAIN_ID=${record.chainId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

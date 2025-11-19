# Vaccine Provenance

## What it does
- 1 token = 1 vaccine lot (ERC-721).
- Custody = token owner. Lifecycle states are enforced by a state machine.
- Temperature readings are events; first out-of-range marks `breach=true`.
- Documents (COA, manifests, receiving reports) stored on IPFS; latest CID anchored on-chain.
- Regulator can toggle recalls with a reason CID (independent of lifecycle).

## Stack
- Solidity, Hardhat, ethers.js, OpenZeppelin
- Local chain: Hardhat node 
- IPFS: Storacha (Web3.storage)

## Setup
```bash
npm install
```

### Start the Local Chain on Terminal 1
```bash
npx hardhat node
```

### Deploy the contracts on Terminal 2
```bash
npx hardhat compile
npx hardhat run scripts/deploy.js --network localhost
```

### Token 1 Workflow (No Breach Scenario)
```bash
# Mint Token 1 (default lot LOT-VAX-2025-001)
npx hardhat run scripts/mintBatch.js --network localhost

# Manufacturer releases Token 1 for QA (Manufactured -> QAReleased)
TOKEN_ID=1 NEXT=1 npx hardhat run scripts/updateStatus.js --network localhost

# Record an in-range temperature reading (5.5°C) using the oracle
TOKEN_ID=1 TEMP_READING=5.5 npx hardhat run scripts/recordTemp.js --network localhost

# Transfer custody from Manufacturer to Distributor
TOKEN_ID=1 TO_ROLE=distributor npx hardhat run scripts/transfer.js --network localhost

# Distributor ships Token 1 (QAReleased -> Shipped)
TOKEN_ID=1 NEXT=2 npx hardhat run scripts/updateStatus.js --network localhost

# Transfer custody from Distributor to Clinic
TOKEN_ID=1 TO_ROLE=clinic npx hardhat run scripts/transfer.js --network localhost

# Clinic receives Token 1 (Shipped -> Received)
TOKEN_ID=1 NEXT=3 npx hardhat run scripts/updateStatus.js --network localhost

# Clinic puts Token 1 into storage (Received -> InStorage)
TOKEN_ID=1 NEXT=4 npx hardhat run scripts/updateStatus.js --network localhost

# Pin a MANIFEST document CID to Token 1 (clinic as current custodian)
TOKEN_ID=1 DOC_TYPE=MANIFEST \
  CID=bafkreia6zhdzijfkayv45m5muqcvbf5eki7bvixuknknu3rd2g52ebvkqy \
  npx hardhat run scripts/pinDocument.js --network localhost

# Final status is consumed
TOKEN_ID=1 NEXT=5 npx hardhat run scripts/updateStatus.js --network localhost

# View the complete on-chain timeline for Token 1 
TOKEN_ID=1 npx hardhat run scripts/timeline.js --network localhost

```

### Token 2 Workflow (Breach and Recall Scenario)
```bash
# Mint Token 2 with a custom lot
LOT=LOT-VAX-2025-002 npx hardhat run scripts/mintBatch.js --network localhost

# Record an in-range temperature for Token 2 (5.0°C) using the oracle
TOKEN_ID=2 TEMP_READING=5.0 npx hardhat run scripts/recordTemp.js --network localhost

# Record an out-of-range high temperature for Token 2 (15.0°C) -> breach
TOKEN_ID=2 TEMP_READING=15.0 npx hardhat run scripts/recordTemp.js --network localhost

# Regulator issues a recall for Token 2 with a reason document CID
TOKEN_ID=2 RECALLED=true \
  REASON_CID=bafkreia6zhdzijfkayv45m5muqcvbf5eki7bvixuknknu3rd2g52ebvkqy \
  npx hardhat run scripts/setRecall.js --network localhost

# View Token 2 timeline showing in-range reading, breach, and recall issuance
TOKEN_ID=2 npx hardhat run scripts/timeline.js --network localhost

```

### Token 3 Workflow (Cold Breach Scenario)
```bash
# Mint Token 3 with another custom lot
LOT=LOT-VAX-2025-003 npx hardhat run scripts/mintBatch.js --network localhost

# Record an out-of-range low temperature for Token 3 (-2.0°C) -> cold breach
TOKEN_ID=3 TEMP_READING=-2.0 npx hardhat run scripts/recordTemp.js --network localhost

# View Token 3 timeline showing the cold breach and updated breach state
TOKEN_ID=3 npx hardhat run scripts/timeline.js --network localhost

```

# Vaccine Supply Chain Smart Contracts Design

## BatchToken (ERC-721)

**Purpose:** 1 token = 1 vaccine lot; the current owner is the current custodian.

**Libraries:** OpenZeppelin ERC721, AccessControl.

### Key functions

```solidity
// Roles
bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

// Mint (only Registry has MINTER_ROLE)
function mint(address to) external returns (uint256 tokenId);

// Standard ERC-721 custody
function ownerOf(uint256 tokenId) public view returns (address);
function safeTransferFrom(address from, address to, uint256 tokenId) public;
```

---

## VaccineRegistry

**Purpose:** batch metadata, lifecycle, temp logging, recalls, document anchors.

**Libraries:** OpenZeppelin AccessControl.

### Roles

```solidity
bytes32 public constant MANUFACTURER = keccak256("MANUFACTURER");
bytes32 public constant DISTRIBUTOR  = keccak256("DISTRIBUTOR");
bytes32 public constant CLINIC       = keccak256("CLINIC");
bytes32 public constant REGULATOR    = keccak256("REGULATOR");
bytes32 public constant ORACLE_UPDATER = keccak256("ORACLE_UPDATER");
```

### Types

```solidity
enum Status { Manufactured, QAReleased, Shipped, Received, InStorage, Consumed }

struct BatchInfo {
  string  lot;
  uint64  expiry;
  int16   tempMinTimes10;
  int16   tempMaxTimes10;
  Status  status;
  bytes32 metadataHash;
  bool    breach;
  uint64  firstBreachAt;

  bool    recalled;
  string  recallReasonCID;
  uint64  recallSetAt;
}

// Latest doc CID per type is tracked separately:
mapping(uint256 => mapping(bytes32 => string)) public latestDocCid;
```

### Events

```solidity
event BatchRegistered(uint256 indexed tokenId, string lot, uint64 expiry, int16 tempMinTimes10, int16 tempMaxTimes10);
event StatusUpdated(uint256 indexed tokenId, Status next, address actor);
event TemperatureEvent(uint256 indexed tokenId, int16 cTimes10, bool isBreach, uint64 at);
event DocumentPinned(uint256 indexed tokenId, bytes32 indexed docType, string cid);
event RecallSet(uint256 indexed tokenId, bool recalled, string reasonCID, uint64 at);
```

### Errors

```solidity
error NotCustodian();
error BadStatusTransition();
error DuplicateLot(); 
```

### Core Functions

```solidity
function mintBatch(
  string calldata lot,
  uint64 expiry,
  int16 tempMinTimes10,
  int16 tempMaxTimes10,
  bytes32 metadataHash, 
  string calldata
) external onlyRole(MANUFACTURER) returns (uint256 tokenId);

function updateStatus(uint256 tokenId, Status next) external; // custodian-only

function recordTemp(uint256 tokenId, int16 cTimes10) external onlyRole(ORACLE_UPDATER);

function pinDocument(uint256 tokenId, bytes32 docType, string calldata cid) external; // custodian-only

function setRecall(uint256 tokenId, bool recalled, string calldata reasonCid) external onlyRole(REGULATOR);

// Views
function batches(uint256 tokenId) external view returns (
    string memory lot,
    uint64 expiry,
    int16 tempMinTimes10,
    int16 tempMaxTimes10,
    Status status,
    bytes32 metadataHash,
    bool breach,
    uint64 firstBreachAt,
    bool recalled,
    string memory recallReasonCID,
    uint64 recallSetAt);

function getBatch(uint256 tokenId) external view returns (
    string memory lot,
    uint64 expiry,
    int16 tempMinTimes10,
    int16 tempMaxTimes10,
    Status status,
    bool breach,
    uint64 firstBreachAt,
    bool recalled,
    string memory recallReasonCID,
    uint64 recallSetAt,
    address currentCustodian
  );
```

---

## State Machine (legal transitions)

```
Manufactured → QAReleased → Shipped → Received → InStorage → Consumed
```

- Enforced in `updateStatus` with require/custom errors.
- Only current custodian (token owner) can advance the batch status.
- Recall is orthogonal; it can be toggled anytime by REGULATOR.

---

## Temperature logging

- `recordTemp` emits `TemperatureEvent`; sets `breach` and `firstBreachAt` once when out-of-range.

---

## Documents

- On-chain stores latest CID per `docType`; full history via `DocumentPinned` events.

---

## Contracts

- **BatchToken.sol:** ERC-721 + MINTER_ROLE for registry.
- **VaccineRegistry.sol:** roles, batch struct, status FSM, temp events, doc CIDs, recalls.

---

# Scripts

- **deploy.js:** Deploys both contracts, grants roles to test accounts, and writes addresses.local.json for other scripts.
- **mintBatch.js:** Mints a new vaccine lot (ERC-721 token) with lot ID, expiry, and allowed temp band; emits BatchRegistered.
- **lib.js:** Helper that reads addresses.local.json and exposes addresses to other scripts.
- **transfer.js:** Transfers custody of a batch token between roles.
- **updateStatus.js:** Advances the lifecycle Status of a batch, enforcing the state machine and custodian check.
- **pinDocument.js:** Pins an off-chain document CID to a batch for a given docType.
- **recordTemp.js** Records a temperature reading for a batch and flags if there is a breach, callable by the oracle
- **setRecall.js** Sets or clears a recall for a batch, with a reason CID, callable by the regulator
- **timeline.js** Prints a human-readable snapshot and full event timeline for a batch
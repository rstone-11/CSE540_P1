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

## Setup
```bash
npm install
```

### Start the Local Chain
```bash
npx hardhat node
```

### Then run scripts
```bash
npx run compile
npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/mintBatch.js --network localhost
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
function mintTo(address to) external returns (uint256 tokenId);

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

struct Batch {
  string  lot;
  uint64  expiry;
  int16   tempMinTimes10;
  int16   tempMaxTimes10;
  Status  status;
  bool    breach;
  uint64  firstBreachAt;
  // recalls (separate from lifecycle)
  bool    recalled;
  string  recallReasonCID;
  uint64  recallSetAt;
  // doc anchors (latest per type)
  mapping(bytes32 => string) docCidByType; //"COA","MANIFEST","RECEIVING" -> CID
}
```

### Events

```solidity
event BatchRegistered(uint256 indexed tokenId, string lot, uint64 expiry, int16 min10, int16 max10);
event StatusUpdated(uint256 indexed tokenId, Status newStatus, address indexed by);
event TemperatureEvent(uint256 indexed tokenId, int16 cTimes10, bool isBreach, uint64 timestamp);
event DocumentPinned(uint256 indexed tokenId, bytes32 indexed docType, string cid);
event RecallSet(uint256 indexed tokenId, bool recalled, string reasonCid, uint64 at);
```

### Errors

```solidity
error NotCustodian();
error BadStatusTransition(Status from, Status to);
error NotAuthorized();
error DuplicateLot(); 
```

### Core Functions

```solidity
function mintBatch(
  string calldata lot,
  uint64 expiry,
  int16 min10,
  int16 max10,
  bytes32 metadataHash, 
  string calldata origin
) external onlyRole(MANUFACTURER) returns (uint256 tokenId);

function updateStatus(uint256 tokenId, Status next) external; // custodian-only

function recordTemp(uint256 tokenId, int16 cTimes10) external onlyRole(ORACLE_UPDATER);

function pinDocument(uint256 tokenId, bytes32 docType, string calldata cid) external; // custodian-only

function setRecall(uint256 tokenId, bool recalled, string calldata reasonCid) external onlyRole(REGULATOR);

// Views
function batches(uint256 tokenId) external view returns ();
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

## Contracts (draft design)

- **BatchToken.sol:** ERC-721 + MINTER_ROLE for registry.
- **VaccineRegistry.sol:** roles, batch struct, status FSM, temp events, doc CIDs, recalls.

---

# Scripts

- **deploy.js:** Deploys both contracts, grants roles to test accounts, and writes addresses.local.json for other scripts.
- **mintBatch.js:** Mints a new vaccine lot (ERC-721 token) with lot ID, expiry, and allowed temp band; emits BatchRegistered.
- **lib.js:** Helper that reads addresses.local.json and exposes addresses to other scripts.
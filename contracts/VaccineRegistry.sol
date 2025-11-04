// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface IBatchToken {
    function ownerOf(uint256 tokenId) external view returns (address);
    function mint(address to) external returns (uint256 tokenId);
}

contract VaccineRegistry is AccessControl {

    bytes32 public constant MANUFACTURER      = keccak256("MANUFACTURER");
    bytes32 public constant DISTRIBUTOR       = keccak256("DISTRIBUTOR");
    bytes32 public constant CLINIC            = keccak256("CLINIC");
    bytes32 public constant REGULATOR         = keccak256("REGULATOR");
    bytes32 public constant ORACLE_UPDATER    = keccak256("ORACLE_UPDATER");

    // Lifecycle states for batches
    enum Status { Manufactured, QAReleased, Shipped, Received, InStorage, Consumed }

    // Snapshot of current batch info
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

    IBatchToken public immutable batchToken;
    mapping(uint256 => BatchInfo) public batches;
    mapping(uint256 => mapping(bytes32 => string)) public latestDocCid; 
    mapping(bytes32 => bool) private lotTaken; 

    event BatchRegistered(uint256 indexed tokenId, string lot, uint64 expiry, int16 tempMinTimes10, int16 tempMaxTimes10);
    event StatusUpdated(uint256 indexed tokenId, Status next, address actor);
    event DocumentPinned(uint256 indexed tokenId, bytes32 indexed docType, string cid);
    event TemperatureEvent(uint256 indexed tokenId, int16 cTimes10, bool isBreach, uint64 at);
    event RecallSet(uint256 indexed tokenId, bool recalled, string reasonCID, uint64 at);

    error NotCustodian();
    error BadStatusTransition();
    error DuplicateLot();

    modifier onlyCustodian(uint256 tokenId) {
        if (batchToken.ownerOf(tokenId) != msg.sender) revert NotCustodian();
        _;
    }

    constructor(address admin, address batchTokenAddr) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        batchToken = IBatchToken(batchTokenAddr);
    }

    // Register a new batch and enforce unique lot
    function mintBatch(
        string calldata lot,
        uint64 expiry,
        int16 tempMinTimes10,
        int16 tempMaxTimes10,
        bytes32 metadataHash,
        string calldata 
    ) external onlyRole(MANUFACTURER) returns (uint256 tokenId) {
        bytes32 lotHash = keccak256(bytes(lot));
        if (lotTaken[lotHash]) revert DuplicateLot();
        lotTaken[lotHash] = true;

        tokenId = batchToken.mint(msg.sender);

        BatchInfo storage b = batches[tokenId];
        b.lot = lot;
        b.expiry = expiry;
        b.tempMinTimes10 = tempMinTimes10;
        b.tempMaxTimes10 = tempMaxTimes10;
        b.status = Status.Manufactured;
        b.metadataHash = metadataHash;

        emit BatchRegistered(tokenId, lot, expiry, tempMinTimes10, tempMaxTimes10);
        emit StatusUpdated(tokenId, Status.Manufactured, msg.sender);
    }

    // Advance lifecycle state
    function updateStatus(uint256 tokenId, Status next) external onlyCustodian(tokenId) {
        Status cur = batches[tokenId].status;
        if (!_allowed(cur, next)) revert BadStatusTransition();
        batches[tokenId].status = next;
        emit StatusUpdated(tokenId, next, msg.sender);
    }

    function pinDocument(uint256 tokenId, bytes32 docType, string calldata cid)
        external onlyCustodian(tokenId)
    {
        latestDocCid[tokenId][docType] = cid;
        emit DocumentPinned(tokenId, docType, cid);
    }

    // Record a temperature reading. First out-of-range marks persistent breach.
    function recordTemp(uint256 tokenId, int16 cTimes10)
        external onlyRole(ORACLE_UPDATER)
    {
        BatchInfo storage b = batches[tokenId];
        uint64 ts = uint64(block.timestamp);
        bool breachNow = (cTimes10 < b.tempMinTimes10 || cTimes10 > b.tempMaxTimes10);

        if (breachNow && !b.breach) {
            b.breach = true;
            b.firstBreachAt = ts;
        }
        emit TemperatureEvent(tokenId, cTimes10, breachNow, ts);
    }

    // Regulator toggles recall and sets a reason CID 
    function setRecall(uint256 tokenId, bool recalled, string calldata reasonCID)
        external onlyRole(REGULATOR)
    {
        BatchInfo storage b = batches[tokenId];
        b.recalled = recalled;
        b.recallReasonCID = reasonCID;
        b.recallSetAt = uint64(block.timestamp);
        emit RecallSet(tokenId, recalled, reasonCID, b.recallSetAt);
    }

    // Allowed lifecycle transitions
    function _allowed(Status cur, Status next) internal pure returns (bool) {
        if (cur == Status.Manufactured) return next == Status.QAReleased;
        if (cur == Status.QAReleased)  return next == Status.Shipped;
        if (cur == Status.Shipped)     return next == Status.Received;
        if (cur == Status.Received)    return next == Status.InStorage;
        if (cur == Status.InStorage)   return next == Status.Consumed;
        return false; 
    }

    // Read-only snapshot and returns batch info plus current custodian.
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
    )
    {
    BatchInfo storage b = batches[tokenId];
    lot = b.lot;
    expiry = b.expiry;
    tempMinTimes10 = b.tempMinTimes10;
    tempMaxTimes10 = b.tempMaxTimes10;
    status = b.status;
    breach = b.breach;
    firstBreachAt = b.firstBreachAt;
    recalled = b.recalled;
    recallReasonCID = b.recallReasonCID;
    recallSetAt = b.recallSetAt;
    currentCustodian = batchToken.ownerOf(tokenId);
    }
}

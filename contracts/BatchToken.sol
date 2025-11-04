// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

// Each token represents one vaccine lot
contract BatchToken is ERC721, AccessControl {
    // Role allowed to mint new lot tokens
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // Auto-incrementing token id counter
    uint256 private _nextId = 1;

    constructor(address admin) ERC721("VaccineLot", "VLOT") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function mint(address to) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        tokenId = _nextId++;
        _safeMint(to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

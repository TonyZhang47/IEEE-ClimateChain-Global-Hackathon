// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HydroTrustVerifier
/// @notice Records hydrological telemetry commitments and mints dREC stewardship credits.
/// @dev Credit minting is gated by the recorder's latest flood index, not by an admin key.
contract HydroTrustVerifier {
    address public owner;
    string public name = "Decentralized Resilience Eco-Credit";
    string public symbol = "dREC";
    uint8 public constant decimals = 0;
    uint256 public totalSupply;
    uint256 public constant MINT_COOLDOWN = 1 hours;
    uint256 public constant MAX_HISTORY = 50;

    struct Telemetry {
        bytes32 dataHash;
        uint256 timestamp;
        string location;
        uint256 flowRate;
        uint256 riskScore;
        string ipfsCid;
        address recorder;
    }

    mapping(string => Telemetry[]) private history;
    mapping(bytes32 => bool) public recordedHashes;
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public lastRiskScore;
    mapping(address => bool) public hasTelemetry;
    mapping(address => uint256) public lastMintAt;

    event TelemetryRecorded(
        bytes32 indexed dataHash,
        uint256 timestamp,
        string location,
        uint256 riskScore
    );
    event CreditMinted(address indexed recipient, uint256 amount);
    event Transfer(address indexed from, address indexed to, uint256 value);

    error EmptyLocation();
    error RiskOutOfRange();
    error EmptyCid();
    error DuplicateTelemetry();
    error HistoryFull();
    error ZeroAddress();
    error ZeroAmount();
    error TelemetryRequired();
    error RiskTooHigh();
    error AmountExceedsCap();
    error CooldownActive();

    constructor() {
        owner = msg.sender;
    }

    /// @notice Store an immutable commitment to a gauge reading and risk score.
    /// @param location Human-readable place key used by getTelemetryHistory.
    /// @param flowRate Discharge in cubic feet per second, already rounded.
    /// @param riskScore Flood vulnerability index from 0 to 100.
    /// @param ipfsCid Content identifier of the full telemetry document.
    /// @return dataHash keccak256(abi.encodePacked(location, flowRate, riskScore, ipfsCid))
    function recordTelemetry(
        string memory location,
        uint256 flowRate,
        uint256 riskScore,
        string memory ipfsCid
    ) external returns (bytes32 dataHash) {
        if (bytes(location).length == 0) revert EmptyLocation();
        if (riskScore > 100) revert RiskOutOfRange();
        if (bytes(ipfsCid).length == 0) revert EmptyCid();
        if (history[location].length >= MAX_HISTORY) revert HistoryFull();

        dataHash = keccak256(abi.encodePacked(location, flowRate, riskScore, ipfsCid));
        if (recordedHashes[dataHash]) revert DuplicateTelemetry();

        recordedHashes[dataHash] = true;
        lastRiskScore[msg.sender] = riskScore;
        hasTelemetry[msg.sender] = true;

        history[location].push(
            Telemetry({
                dataHash: dataHash,
                timestamp: block.timestamp,
                location: location,
                flowRate: flowRate,
                riskScore: riskScore,
                ipfsCid: ipfsCid,
                recorder: msg.sender
            })
        );

        emit TelemetryRecorded(dataHash, block.timestamp, location, riskScore);
    }

    /// @notice Mint dREC to `to` when the caller's latest recorded flood index is at most 75.
    /// @dev Amount is capped at (100 - lastRiskScore) * 10 so a single call cannot inflate supply.
    function mintWaterCredit(address to, uint256 amount) external {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (!hasTelemetry[msg.sender]) revert TelemetryRequired();
        if (lastRiskScore[msg.sender] > 75) revert RiskTooHigh();
        uint256 cap = (100 - lastRiskScore[msg.sender]) * 10;
        if (amount > cap) revert AmountExceedsCap();
        if (block.timestamp < lastMintAt[msg.sender] + MINT_COOLDOWN) revert CooldownActive();

        lastMintAt[msg.sender] = block.timestamp;
        totalSupply += amount;
        balanceOf[to] += amount;

        emit CreditMinted(to, amount);
        emit Transfer(address(0), to, amount);
    }

    /// @notice Full telemetry log for a location key, capped at MAX_HISTORY.
    function getTelemetryHistory(string memory location) external view returns (Telemetry[] memory) {
        return history[location];
    }
}

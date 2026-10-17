import { Contract, Interface, type Provider, type Signer } from "ethers";
import type { OnChainTelemetry } from "@/types/web3";

export const hydroTrustAbi = [
  "function owner() view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function lastRiskScore(address) view returns (uint256)",
  "function hasTelemetry(address) view returns (bool)",
  "function recordedHashes(bytes32) view returns (bool)",
  "function recordTelemetry(string location, uint256 flowRate, uint256 riskScore, string ipfsCid) returns (bytes32)",
  "function mintWaterCredit(address to, uint256 amount)",
  "function getTelemetryHistory(string location) view returns (tuple(bytes32 dataHash, uint256 timestamp, string location, uint256 flowRate, uint256 riskScore, string ipfsCid, address recorder)[])",
  "event TelemetryRecorded(bytes32 indexed dataHash, uint256 timestamp, string location, uint256 riskScore)",
  "event CreditMinted(address indexed recipient, uint256 amount)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
] as const;

export function contractAddress(): string | null {
  const value = process.env.NEXT_PUBLIC_HYDROTRUST_CONTRACT?.trim();
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return value;
}

export function expectedChainId(): number | null {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function hydroTrustInterface(): Interface {
  return new Interface(hydroTrustAbi);
}

export function encodeRecordTelemetry(location: string, flowRate: number, riskScore: number, ipfsCid: string): string {
  return hydroTrustInterface().encodeFunctionData("recordTelemetry", [location, flowRate, riskScore, ipfsCid]);
}

export function encodeMint(to: string, amount: number): string {
  return hydroTrustInterface().encodeFunctionData("mintWaterCredit", [to, amount]);
}

export function connectHydroTrust(address: string, signerOrProvider: Signer | Provider): Contract {
  return new Contract(address, hydroTrustAbi, signerOrProvider);
}

export function parseHistory(value: unknown): OnChainTelemetry[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const record = row as {
      dataHash: string;
      timestamp: bigint;
      location: string;
      flowRate: bigint;
      riskScore: bigint;
      ipfsCid: string;
      recorder: string;
    };
    return {
      dataHash: String(record.dataHash),
      timestamp: Number(record.timestamp),
      location: String(record.location),
      flowRate: Number(record.flowRate),
      riskScore: Number(record.riskScore),
      ipfsCid: String(record.ipfsCid),
      recorder: String(record.recorder),
    };
  });
}

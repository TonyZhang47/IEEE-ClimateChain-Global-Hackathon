import { getBytes, sha256, solidityPackedKeccak256, toUtf8Bytes } from "ethers";
import type { CommitmentDocument, PreparedCommitment, TelemetryPayload } from "@/types/web3";

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

export function integerFlow(flowRateCfs: number | null): number {
  if (flowRateCfs === null || !Number.isFinite(flowRateCfs) || flowRateCfs < 0) return 0;
  return Math.round(flowRateCfs);
}

export function creditEligibility(
  floodIndex: number,
  sequestrationTco2ePerYear: number,
): { eligible: boolean; amount: number; reason: string } {
  const risk = clampScore(floodIndex);
  if (risk > 75) {
    return {
      eligible: false,
      amount: 0,
      reason: "Flood index is above 75. The contract rejects minting until a later reading comes in at 75 or below.",
    };
  }
  const fromCarbon = Math.floor(Math.max(0, sequestrationTco2ePerYear) * 10);
  const cap = (100 - risk) * 10;
  const amount = Math.min(fromCarbon, cap);
  if (amount < 1) {
    return {
      eligible: false,
      amount: 0,
      reason: "Sequestration in this window is under 0.1 tCO₂e/yr, so the credit amount rounds to zero.",
    };
  }
  return {
    eligible: true,
    amount,
    reason: `${amount} dREC. Carbon term is floor(sequestration × 10) = ${fromCarbon}; on-chain cap is (100 − flood index) × 10 = ${cap}.`,
  };
}

export function buildCommitment(
  input: TelemetryPayload,
  recordedAt = new Date().toISOString(),
): Omit<PreparedCommitment, "pinned" | "pinError" | "contractAddress" | "chainId" | "contractReady"> {
  const payload: TelemetryPayload = {
    location: input.location.trim().slice(0, 180),
    latitude: round6(input.latitude),
    longitude: round6(input.longitude),
    flowRateCfs: integerFlow(input.flowRateCfs),
    floodIndex: clampScore(input.floodIndex),
    blueCarbonIndex: clampScore(input.blueCarbonIndex),
    sequestrationTco2ePerYear: Math.round(input.sequestrationTco2ePerYear * 1000) / 1000,
  };
  const document: CommitmentDocument = {
    schema: "hydrotrust.telemetry.v1",
    recordedAt,
    payload,
  };
  const canonical = JSON.stringify(document);
  const ipfsCid = ipfsCidV1(canonical);
  const dataHash = chainDataHash(payload.location, payload.flowRateCfs, payload.floodIndex, ipfsCid);
  const credit = creditEligibility(payload.floodIndex, payload.sequestrationTco2ePerYear);
  return {
    document,
    canonical,
    ipfsCid,
    dataHash,
    eligible: credit.eligible,
    creditAmount: credit.amount,
    eligibilityReason: credit.reason,
  };
}

export function chainDataHash(location: string, flowRate: number, riskScore: number, ipfsCid: string): string {
  return solidityPackedKeccak256(
    ["string", "uint256", "uint256", "string"],
    [location, flowRate, riskScore, ipfsCid],
  );
}

export function ipfsCidV1(content: string): string {
  const digest = getBytes(sha256(toUtf8Bytes(content)));
  const cid = new Uint8Array(4 + digest.length);
  cid.set([0x01, 0x55, 0x12, 0x20], 0);
  cid.set(digest, 4);
  return `b${base32Encode(cid)}`;
}

export async function pinToWeb3Storage(canonical: string, cid: string): Promise<{ pinned: boolean; pinError?: string; cid: string }> {
  const token = process.env.WEB3_STORAGE_TOKEN;
  if (!token) {
    return { pinned: false, cid, pinError: "WEB3_STORAGE_TOKEN is not set. The CID is a local raw CIDv1 and has not been pinned." };
  }

  try {
    const response = await fetch("https://api.web3.storage/upload", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Name": "hydrotrust-telemetry.json",
      },
      body: canonical,
    });
    if (!response.ok) {
      return {
        pinned: false,
        cid,
        pinError: `Web3.Storage responded ${response.status}. The local CID is still valid as a content address.`,
      };
    }
    const body: unknown = await response.json();
    const remoteCid =
      typeof body === "object" && body !== null && "cid" in body && typeof (body as { cid: unknown }).cid === "string"
        ? (body as { cid: string }).cid
        : null;
    return { pinned: true, cid: remoteCid ?? cid };
  } catch (error) {
    const message = error instanceof Error ? error.message : "pin failed";
    return { pinned: false, cid, pinError: `${message}. The local CID is still valid as a content address.` };
  }
}

function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31] ?? "";
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31] ?? "";
  }
  return output;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

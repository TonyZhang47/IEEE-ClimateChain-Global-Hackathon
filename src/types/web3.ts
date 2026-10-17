export interface TelemetryPayload {
  location: string;
  latitude: number;
  longitude: number;
  flowRateCfs: number;
  floodIndex: number;
  blueCarbonIndex: number;
  sequestrationTco2ePerYear: number;
}

export interface CommitmentDocument {
  schema: "hydrotrust.telemetry.v1";
  recordedAt: string;
  payload: TelemetryPayload;
}

export interface PreparedCommitment {
  document: CommitmentDocument;
  canonical: string;
  ipfsCid: string;
  dataHash: string;
  pinned: boolean;
  pinError?: string;
  eligible: boolean;
  creditAmount: number;
  eligibilityReason: string;
  contractAddress: string | null;
  chainId: number | null;
  contractReady: boolean;
  contractNote?: string;
}

export interface VerificationRecord {
  id: string;
  location: string;
  dataHash: string;
  ipfsCid: string;
  txHash: string | null;
  mintTxHash: string | null;
  timestamp: number;
  riskScore: number;
  flowRate: number;
  creditAmount: number;
  status: "local-commitment" | "submitted" | "confirmed";
  chainId?: number;
}

export interface WalletSnapshot {
  address: string | null;
  chainId: number | null;
  error: string | null;
  connecting: boolean;
}

export interface OnChainTelemetry {
  dataHash: string;
  timestamp: number;
  location: string;
  flowRate: number;
  riskScore: number;
  ipfsCid: string;
  recorder: string;
}

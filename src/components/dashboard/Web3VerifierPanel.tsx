"use client";

import { useEffect, useRef, useState } from "react";
import type { HydroSnapshot } from "@/types/hydro";
import type { OnChainTelemetry, PreparedCommitment, VerificationRecord } from "@/types/web3";
import { contractAddress, encodeRecordTelemetry } from "@/lib/blockchain/contractInterface";
import {
  mintCreditOnChain,
  readCreditBalance,
  readTelemetryHistory,
  recordTelemetryOnChain,
  useHydroWallet,
  walletError,
} from "@/lib/blockchain/web3Provider";
import { shortAddress, shortHash } from "@/lib/utils";

const LOG_KEY = "hydrotrust.verifications";

interface Web3VerifierPanelProps {
  snapshot: HydroSnapshot;
  onCommitment: (commitment: PreparedCommitment | null) => void;
  onVerification: (record: VerificationRecord | null) => void;
}

export function Web3VerifierPanel({ snapshot, onCommitment, onVerification }: Web3VerifierPanelProps) {
  const wallet = useHydroWallet();
  const [commitment, setCommitment] = useState<PreparedCommitment | null>(null);
  const [record, setRecord] = useState<VerificationRecord | null>(null);
  const [history, setHistory] = useState<VerificationRecord[]>([]);
  const [chainHistory, setChainHistory] = useState<OnChainTelemetry[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState<"record" | "mint" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const onCommitmentRef = useRef(onCommitment);
  const onVerificationRef = useRef(onVerification);
  onCommitmentRef.current = onCommitment;
  onVerificationRef.current = onVerification;

  useEffect(() => {
    setHistory(readLog());
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setRecord(null);
    onVerificationRef.current(null);
    const primary = snapshot.gauges.find((gauge) => gauge.siteId === snapshot.primarySiteId) ?? snapshot.gauges[0];
    const body = {
      location: snapshot.place.label,
      latitude: snapshot.place.latitude,
      longitude: snapshot.place.longitude,
      flowRateCfs: primary?.dischargeCfs ?? 0,
      floodIndex: snapshot.risk.score,
      blueCarbonIndex: snapshot.blueCarbon.score,
      sequestrationTco2ePerYear: snapshot.blueCarbon.annualSequestrationTco2e,
    };
    void fetch("/api/verify-onchain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok || !isCommitment(payload)) {
          throw new Error(readError(payload) ?? "The commitment could not be prepared.");
        }
        setCommitment(payload);
        onCommitmentRef.current(payload);
        const local: VerificationRecord = {
          id: payload.ipfsCid,
          location: payload.document.payload.location,
          dataHash: payload.dataHash,
          ipfsCid: payload.ipfsCid,
          txHash: null,
          mintTxHash: null,
          timestamp: Date.parse(payload.document.recordedAt) || Date.now(),
          riskScore: payload.document.payload.floodIndex,
          flowRate: payload.document.payload.flowRateCfs,
          creditAmount: payload.creditAmount,
          status: "local-commitment",
        };
        setRecord(local);
        onVerificationRef.current(local);
        setHistory(upsertLog(local));
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Commitment failed.");
        setCommitment(null);
        onCommitmentRef.current(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [snapshot]);

  useEffect(() => {
    if (!wallet.address || !commitment) return;
    void readCreditBalance(wallet.address).then(setBalance);
    void readTelemetryHistory(commitment.document.payload.location).then(setChainHistory);
  }, [wallet.address, commitment]);

  const updateRecord = (next: VerificationRecord) => {
    setRecord(next);
    onVerificationRef.current(next);
    setHistory(upsertLog(next));
  };

  const recordOnChain = async () => {
    if (!commitment) return;
    setBusy("record");
    setError(null);
    try {
      const payload = commitment.document.payload;
      const result = await recordTelemetryOnChain(payload.location, payload.flowRateCfs, payload.floodIndex, commitment.ipfsCid);
      updateRecord({
        ...(record ?? blankRecord(commitment)),
        txHash: result.txHash,
        status: "confirmed",
        chainId: result.chainId,
        timestamp: Date.now(),
      });
      setChainHistory(await readTelemetryHistory(payload.location));
    } catch (reason) {
      setError(walletError(reason));
    } finally {
      setBusy(null);
    }
  };

  const mint = async () => {
    if (!commitment || !wallet.address) return;
    setBusy("mint");
    setError(null);
    try {
      const result = await mintCreditOnChain(wallet.address, commitment.creditAmount);
      const next = {
        ...(record ?? blankRecord(commitment)),
        mintTxHash: result.txHash,
        chainId: result.chainId,
      };
      updateRecord(next);
      setBalance(await readCreditBalance(wallet.address));
    } catch (reason) {
      setError(walletError(reason));
    } finally {
      setBusy(null);
    }
  };

  const calldata = commitment
    ? encodeRecordTelemetry(
        commitment.document.payload.location,
        commitment.document.payload.flowRateCfs,
        commitment.document.payload.floodIndex,
        commitment.ipfsCid,
      )
    : null;
  const deployed = contractAddress();

  return (
    <section className="glass rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-mist">Telemetry commitment</p>
          <h3 className="mt-1 text-base text-foam">HydroTrustVerifier</h3>
        </div>
        {wallet.address ? (
          <button type="button" className="btn-ghost" onClick={wallet.disconnect}>
            {shortAddress(wallet.address)}
            {wallet.chainId ? ` · ${wallet.chainId}` : ""}
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => void wallet.connect()} disabled={wallet.connecting}>
            {wallet.connecting ? "Connecting…" : "Connect wallet"}
          </button>
        )}
      </div>
      {wallet.error ? <p className="mt-3 text-sm text-coral">{wallet.error}</p> : null}
      {loading ? <p className="mt-4 text-sm text-mist">Hashing the snapshot into a CIDv1…</p> : null}
      {commitment ? (
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Data hash" value={shortHash(commitment.dataHash)} copy={commitment.dataHash} />
          <Row label="IPFS CID" value={shortHash(commitment.ipfsCid)} copy={commitment.ipfsCid} />
          <Row label="Pin" value={commitment.pinned ? "Pinned" : commitment.pinError ?? "Local CID only"} />
          <Row label="Contract" value={deployed ? shortAddress(deployed) : "Not configured"} />
          <Row label="dREC balance" value={balance === null ? "—" : `${balance}`} />
          <p className="text-mist">{commitment.eligibilityReason}</p>
          {commitment.contractNote ? <p className="text-xs text-amber">{commitment.contractNote}</p> : null}
        </dl>
      ) : null}
      {calldata ? <p className="mt-3 break-all font-mono text-[11px] text-mist">calldata {shortHash(calldata)}</p> : null}
      {error ? <p className="mt-3 text-sm text-coral">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={!commitment || !wallet.address || !deployed || busy !== null} onClick={() => void recordOnChain()}>
          {busy === "record" ? "Waiting for confirmation…" : "Record telemetry"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={!commitment?.eligible || !wallet.address || !deployed || record?.status !== "confirmed" || busy !== null}
          onClick={() => void mint()}
        >
          {busy === "mint" ? "Minting…" : commitment ? `Mint ${commitment.creditAmount} dREC` : "Mint dREC"}
        </button>
      </div>
      {chainHistory.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-mist">On-chain history for this location</p>
          <ul className="mt-2 space-y-2 text-xs text-mist">
            {chainHistory.slice(-4).reverse().map((item) => (
              <li key={`${item.dataHash}-${item.timestamp}`} className="rounded-xl border border-line px-3 py-2">
                {new Date(item.timestamp * 1000).toISOString()} · risk {item.riskScore} · {shortHash(item.ipfsCid)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {history.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-mist">Local verification log</p>
          <ul className="mt-2 space-y-2 text-xs text-mist">
            {history.slice(0, 4).map((item) => (
              <li key={item.id} className="rounded-xl border border-line px-3 py-2">
                <span className="text-foam">{item.status}</span> · {item.location.split(",")[0]} · {shortHash(item.dataHash)}
                {item.txHash ? ` · tx ${shortHash(item.txHash)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-mist">{label}</dt>
      <dd className="text-right font-mono text-foam">
        {value}
        {copy ? (
          <button
            type="button"
            className="ml-2 text-[10px] uppercase tracking-[0.12em] text-aqua"
            onClick={() => void navigator.clipboard.writeText(copy)}
          >
            Copy
          </button>
        ) : null}
      </dd>
    </div>
  );
}

function blankRecord(commitment: PreparedCommitment): VerificationRecord {
  return {
    id: commitment.ipfsCid,
    location: commitment.document.payload.location,
    dataHash: commitment.dataHash,
    ipfsCid: commitment.ipfsCid,
    txHash: null,
    mintTxHash: null,
    timestamp: Date.now(),
    riskScore: commitment.document.payload.floodIndex,
    flowRate: commitment.document.payload.flowRateCfs,
    creditAmount: commitment.creditAmount,
    status: "local-commitment",
  };
}

function readLog(): VerificationRecord[] {
  try {
    const raw = window.localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord);
  } catch {
    return [];
  }
}

function upsertLog(record: VerificationRecord): VerificationRecord[] {
  const next = [record, ...readLog().filter((item) => item.id !== record.id)].slice(0, 12);
  window.localStorage.setItem(LOG_KEY, JSON.stringify(next));
  return next;
}

function isRecord(value: unknown): value is VerificationRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<VerificationRecord>;
  return typeof record.id === "string" && typeof record.dataHash === "string" && typeof record.location === "string";
}

function isCommitment(value: unknown): value is PreparedCommitment {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<PreparedCommitment>;
  return typeof record.dataHash === "string" && typeof record.ipfsCid === "string" && typeof record.canonical === "string" && record.document !== undefined;
}

function readError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("error" in value)) return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

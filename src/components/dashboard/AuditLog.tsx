"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { VerificationRecord } from "@/types/web3";
import { chainDataHash, ipfsCidV1 } from "@/lib/blockchain/commitment";
import { contractAddress } from "@/lib/blockchain/contractInterface";
import { NETWORKS } from "@/lib/experience/catalog";
import { shortHash } from "@/lib/utils";

export function AuditLog() {
  const [records, setRecords] = useState<VerificationRecord[]>([]);
  const [payload, setPayload] = useState("");
  const [check, setCheck] = useState<string | null>(null);
  const deployed = contractAddress();

  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem("hydrotrust.verifications") ?? "[]");
      if (!Array.isArray(parsed)) return;
      setRecords(parsed.filter(isRecord));
    } catch {
      setRecords([]);
    }
  }, []);

  const verify = () => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (!isDocument(parsed)) {
        setCheck("Paste the canonical commitment JSON. It needs schema, recordedAt, and payload.");
        return;
      }
      const canonical = JSON.stringify(parsed);
      const cid = ipfsCidV1(canonical);
      const hash = chainDataHash(parsed.payload.location, parsed.payload.flowRateCfs, parsed.payload.floodIndex, cid);
      const match = records.find((record) => record.dataHash.toLowerCase() === hash.toLowerCase());
      setCheck(
        match
          ? `Matches a local record (${match.status}). ${match.txHash ? `Transaction ${match.txHash}.` : "No chain transaction is stored for it yet."}`
          : `Recomputed ${hash}. It does not match a commitment saved in this browser.`,
      );
    } catch {
      setCheck("That text is not JSON.");
    }
  };

  return (
    <div className="space-y-4 text-sm text-mist">
      <p>
        This list is the commitment log in this browser. A row gains a block explorer link only after a wallet confirms a transaction. Nothing here is invented chain activity.
      </p>
      <p className="font-mono text-xs text-foam">
        Contract {deployed ?? "not configured"}
        {deployed ? (
          <button type="button" className="ml-2 text-aqua" onClick={() => void navigator.clipboard.writeText(deployed)}>
            Copy
          </button>
        ) : null}
      </p>
      {records.length === 0 ? <p>No commitments saved in this browser yet. Open a watershed and the chain desk prepares one.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase tracking-[0.12em] text-mist">
              <tr>
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Place</th>
                <th className="py-2 pr-3">Flow</th>
                <th className="py-2 pr-3">Hash</th>
                <th className="py-2">Explorer</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-t border-line">
                  <td className="py-2 pr-3">{new Date(record.timestamp).toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="py-2 pr-3">{record.location.split(",")[0]}</td>
                  <td className="py-2 pr-3 font-mono">{record.flowRate} cfs</td>
                  <td className="py-2 pr-3 font-mono">{shortHash(record.dataHash)}</td>
                  <td className="py-2">{explorerLink(record)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <label className="block text-foam">
        Recompute a hash
        <textarea
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          className="mt-2 h-28 w-full rounded-xl border border-line bg-black/30 p-3 font-mono text-xs text-foam"
          placeholder='Paste canonical JSON: {"schema":"hydrotrust.telemetry.v1",...}'
        />
      </label>
      <button type="button" className="btn-primary" onClick={verify}>Verify hash</button>
      {check ? <p>{check}</p> : null}
    </div>
  );
}

function explorerLink(record: VerificationRecord): ReactNode {
  if (!record.txHash || !record.chainId) return record.status;
  const network = NETWORKS.find((item) => item.chainId === record.chainId);
  if (!network?.explorer) return shortHash(record.txHash);
  return (
    <a className="text-aqua underline-offset-4 hover:underline" href={`${network.explorer}/tx/${record.txHash}`} target="_blank" rel="noreferrer">
      {shortHash(record.txHash)}
    </a>
  );
}

function isRecord(value: unknown): value is VerificationRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<VerificationRecord>;
  return typeof record.id === "string" && typeof record.dataHash === "string" && typeof record.location === "string" && typeof record.timestamp === "number";
}

function isDocument(value: unknown): value is { payload: { location: string; flowRateCfs: number; floodIndex: number } } {
  if (typeof value !== "object" || value === null || !("payload" in value)) return false;
  const payload = (value as { payload?: unknown }).payload;
  if (typeof payload !== "object" || payload === null) return false;
  const row = payload as { location?: unknown; flowRateCfs?: unknown; floodIndex?: unknown };
  return typeof row.location === "string" && typeof row.flowRateCfs === "number" && typeof row.floodIndex === "number";
}

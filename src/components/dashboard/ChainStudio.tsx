"use client";

import { useEffect, useState } from "react";
import type { HydroSnapshot } from "@/types/hydro";
import type { PreparedCommitment, VerificationRecord } from "@/types/web3";
import { NETWORKS } from "@/lib/experience/catalog";
import { contractAddress, encodeRecordTelemetry } from "@/lib/blockchain/contractInterface";
import {
  connectWith,
  estimateRecordGas,
  requestWallets,
  signCanonical,
  switchNetwork,
  useAnnouncedWallets,
  useHydroWallet,
  walletError,
} from "@/lib/blockchain/web3Provider";
import { pushToast } from "@/lib/experience/toasts";
import { shortHash } from "@/lib/utils";

interface ChainStudioProps {
  snapshot: HydroSnapshot;
  commitment: PreparedCommitment | null;
}

const VOTE_KEY = "hydrotrust.votes";
const BOOK_KEY = "hydrotrust.book";
const BADGE_KEY = "hydrotrust.badges";

export function ChainStudio({ snapshot, commitment }: ChainStudioProps) {
  const wallet = useHydroWallet();
  const wallets = useAnnouncedWallets();
  const [source, setSource] = useState<string | null>(null);
  const [gas, setGas] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<string | null>(null);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [book, setBook] = useState<string[]>([]);
  const [badges, setBadges] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [history, setHistory] = useState<VerificationRecord[]>([]);
  const deployed = contractAddress();
  const gauge = snapshot.gauges.find((item) => item.siteId === snapshot.primarySiteId) ?? snapshot.gauges[0];
  const trigger = (gauge?.gageHeightFt ?? 0) >= 20 || (gauge?.dischargeCfs ?? 0) >= 20000;
  const payout = trigger ? Math.min(1000, Math.round(((gauge?.dischargeCfs ?? 0) - 20000) / 50)) : 0;

  useEffect(() => {
    requestWallets();
    setVotes(readMap(VOTE_KEY));
    setBook(readList(BOOK_KEY));
    setBadges(readList(BADGE_KEY));
    setHistory(readHistory());
  }, [commitment]);

  useEffect(() => {
    if (snapshot.risk.score < 60) return;
    const label = `Opened ${snapshot.place.label.split(",")[0]} above 60`;
    setBadges((current) => {
      if (current.includes(label)) return current;
      const next = [...current, label].slice(-8);
      window.localStorage.setItem(BADGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [snapshot]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/HydroTrustVerifier.sol")
      .then((response) => response.text())
      .then((text) => {
        if (!cancelled) setSource(text);
      })
      .catch(() => {
        if (!cancelled) setSource(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const steps = [
    { label: "Capture", done: true, detail: snapshot.place.label },
    { label: "SHA-256 / keccak", done: Boolean(commitment), detail: commitment ? shortHash(commitment.dataHash) : "Waiting" },
    { label: "CID", done: Boolean(commitment), detail: commitment ? (commitment.pinned ? "Pinned" : "Local CID") : "Waiting" },
    { label: "Contract", done: Boolean(history.some((item) => item.status === "confirmed")), detail: deployed ? shortHash(deployed) : "No address configured" },
  ];

  const vote = (id: string) => {
    const next = { ...votes, [id]: (votes[id] ?? 0) + 1 };
    setVotes(next);
    window.localStorage.setItem(VOTE_KEY, JSON.stringify(next));
    pushToast("Vote stored in this browser. No DAO transaction was sent.");
  };

  const takeOrder = (id: string) => {
    const next = book.includes(id) ? book : [...book, id];
    setBook(next);
    window.localStorage.setItem(BOOK_KEY, JSON.stringify(next));
    pushToast("Order noted locally. This is not a marketplace fill.");
  };

  const estimate = async () => {
    if (!commitment) return;
    setNote(null);
    try {
      const result = await estimateRecordGas(
        commitment.document.payload.location,
        commitment.document.payload.flowRateCfs,
        commitment.document.payload.floodIndex,
        commitment.ipfsCid,
      );
      setGas(`${result.gas} gas${result.feeEth ? ` · about ${result.feeEth} native` : ""}`);
    } catch (error) {
      setNote(walletError(error));
    }
  };

  const sign = async () => {
    if (!commitment) return;
    try {
      const signed = await signCanonical(commitment.canonical);
      setSignature(signed.signature);
      setRecovered(signed.recovered);
      pushToast("Signature checked in the browser.");
    } catch (error) {
      setNote(walletError(error));
    }
  };

  const confirmed = history.filter((item) => item.status === "confirmed");

  return (
    <section className="glass space-y-4 rounded-2xl p-4 text-sm text-mist">
      <p className="text-[11px] uppercase tracking-[0.16em] text-foam">Chain desk</p>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center justify-between gap-3">
            <span className={step.done ? "text-aqua" : "text-mist"}>{index + 1}. {step.label}</span>
            <span className="font-mono text-xs text-foam">{step.detail}</span>
          </li>
        ))}
      </ol>
      {commitment ? (
        <p>
          Hash commitment only. This is not a zero-knowledge proof.{" "}
          <a className="text-aqua underline-offset-4 hover:underline" href={`https://ipfs.io/ipfs/${commitment.ipfsCid}`} target="_blank" rel="noreferrer">
            {commitment.pinned ? "Open pinned CID" : "CID link (local hashes 404 until pinned)"}
          </a>
        </p>
      ) : null}
      <p className="text-xs">Record and mint still follow NEXT_PUBLIC_CHAIN_ID when that variable is set. The buttons below switch the wallet first.</p>
      <div className="flex flex-wrap gap-1">
        {NETWORKS.map((network) => (
          <button
            key={network.chainId}
            type="button"
            className={wallet.chainId === network.chainId ? "btn-primary" : "btn-ghost"}
            onClick={() => {
              void switchNetwork(network.chainId).catch((error: unknown) => setNote(walletError(error)));
            }}
          >
            {network.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {wallets.length === 0 ? <span>No EIP-6963 wallet announced yet. The connect button uses the injected provider.</span> : null}
        {wallets.map((item) => (
          <button key={item.rdns} type="button" className="btn-ghost" onClick={() => void connectWith(item.provider)}>
            {item.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" disabled={!commitment || !wallet.address} onClick={() => void estimate()}>
          Estimate gas
        </button>
        <button type="button" className="btn-ghost" disabled={!commitment} onClick={() => void sign()}>
          Sign payload
        </button>
      </div>
      {gas ? <p className="font-mono text-xs text-foam">{gas}</p> : null}
      {signature ? (
        <p className="break-all font-mono text-xs text-foam">
          Recovered {recovered}. {recovered && wallet.address && recovered.toLowerCase() === wallet.address.toLowerCase() ? "It matches the connected account." : "Compare it with the signing account."}
        </p>
      ) : null}
      <div className="rounded-xl border border-line p-3">
        <p className="text-foam">Parametric screen</p>
        <p className="mt-1">
          {trigger
            ? `A policy written at 20 ft or 20,000 ft³/s would show about ${Math.max(payout, 0)} illustrative units. No USDC is sent.`
            : "The active gauge is under the 20 ft / 20,000 ft³/s illustration threshold. No payout is simulated."}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Mini title="Gauge API" body="USGS" />
        <Mini title="This server" body="Hash + CID" />
        <Mini title="Oracle" body="Chainlink is not connected" />
      </div>
      <div className="rounded-xl border border-line p-3">
        <p className="text-foam">Local vote tally</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => vote("wetland")}>Fund wetland edge ({votes.wetland ?? 0})</button>
          <button type="button" className="btn-ghost" onClick={() => vote("gauge")}>Fund gauge watch ({votes.gauge ?? 0})</button>
        </div>
      </div>
      <div className="rounded-xl border border-line p-3">
        <p className="text-foam">Demo order book</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => takeOrder("bid-1")}>Note 10 credit bid</button>
          <button type="button" className="btn-ghost" onClick={() => takeOrder("ask-1")}>Note 10 credit ask</button>
        </div>
        <p className="mt-2">{book.length === 0 ? "No local notes yet." : `${book.length} local notes. Nothing is listed on a market.`}</p>
      </div>
      <div>
        <p className="text-foam">Confirmed records in this browser</p>
        {confirmed.length === 0 ? <p className="mt-1">No confirmed mint or record yet, so there is no leaderboard to rank.</p> : (
          <ul className="mt-2 space-y-1">
            {confirmed.slice(0, 5).map((item) => (
              <li key={item.id}>{item.location.split(",")[0]} · score {item.riskScore} · {item.txHash ? shortHash(item.txHash) : "no tx"}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-foam">Exploration marks</p>
        <p className="mt-1">{badges.length === 0 ? "Open a watershed scored 60 or higher to store a local mark." : badges.join(" · ")}</p>
      </div>
      <ul className="space-y-1 text-xs">
        <li>The contract checks telemetry before minting, caps credits with the flood index, and enforces a one-hour cooldown.</li>
        <li>It does not import OpenZeppelin. Do not read this panel as an audit.</li>
      </ul>
      <div className="certificate rounded-2xl border border-aqua/40 p-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-aqua">Certificate preview</p>
        <p className="mt-2 text-lg text-foam">{snapshot.place.label}</p>
        <p className="mt-1 font-mono text-xs">Flood {snapshot.risk.score} · carbon {snapshot.blueCarbon.score}</p>
        <p className="mt-2 text-xs">Preview only. Nothing is minted as an NFT.</p>
      </div>
      <details>
        <summary className="cursor-pointer text-foam">Contract source in this repository</summary>
        <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-black/40 p-3 font-mono text-[11px] text-foam">{source ?? "Loading source…"}</pre>
      </details>
      {commitment ? (
        <p className="break-all font-mono text-[11px] text-foam">
          {encodeRecordTelemetry(commitment.document.payload.location, commitment.document.payload.flowRateCfs, commitment.document.payload.floodIndex, commitment.ipfsCid).slice(0, 120)}…
        </p>
      ) : null}
      {note ? <p className="text-coral">{note}</p> : null}
    </section>
  );
}

function Mini({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-line px-2 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-aqua">{title}</p>
      <p className="mt-1 text-xs text-foam">{body}</p>
    </div>
  );
}

function readHistory(): VerificationRecord[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem("hydrotrust.verifications") ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is VerificationRecord => {
      if (typeof item !== "object" || item === null) return false;
      const record = item as Partial<VerificationRecord>;
      return typeof record.id === "string" && typeof record.status === "string" && typeof record.location === "string";
    });
  } catch {
    return [];
  }
}

function readList(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readMap(key: string): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    if (typeof parsed !== "object" || parsed === null) return {};
    const next: Record<string, number> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "number") next[name] = value;
    }
    return next;
  } catch {
    return {};
  }
}

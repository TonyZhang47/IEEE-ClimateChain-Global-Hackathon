"use client";

import { useState } from "react";
import { Droplets, Menu, X } from "lucide-react";
import { shortAddress } from "@/lib/utils";
import { useHydroWallet } from "@/lib/blockchain/web3Provider";
import { NETWORKS } from "@/lib/experience/catalog";

interface HeaderProps {
  stage: "orbit" | "descent" | "workspace";
  onNavigate: (stage: "orbit" | "workspace") => void;
  workspaceEnabled: boolean;
}

export function Header({ stage, onNavigate, workspaceEnabled }: HeaderProps) {
  const wallet = useHydroWallet();
  const [open, setOpen] = useState(false);
  const network = NETWORKS.find((item) => item.chainId === wallet.chainId);

  return (
    <header className="relative z-30 px-4 py-3 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl border border-aqua/40 bg-aqua/10 text-aqua">
            <Droplets size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-wide text-foam">Proof Of Flow</p>
            <p className="text-[11px] uppercase tracking-[0.16em] text-mist">IEEE ClimateChain · resilience track</p>
          </div>
        </div>
        <nav className="hidden items-center gap-2 xl:flex">
          <button type="button" className={stage !== "workspace" ? "btn-primary" : "btn-ghost"} onClick={() => onNavigate("orbit")}>
            Globe
          </button>
          <button type="button" className={stage === "workspace" ? "btn-primary" : "btn-ghost"} disabled={!workspaceEnabled} onClick={() => onNavigate("workspace")}>
            Watershed
          </button>
          <ConnectBadge address={wallet.address} chain={network?.name ?? (wallet.chainId ? String(wallet.chainId) : null)} connecting={wallet.connecting} error={wallet.error} onConnect={() => void wallet.connect()} onDisconnect={wallet.disconnect} />
        </nav>
        <button type="button" className="btn-ghost xl:hidden" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? <X size={16} /> : <Menu size={16} />}
          Menu
        </button>
      </div>
      {open ? (
        <div className="glass absolute right-4 top-16 z-40 flex w-64 flex-col gap-2 rounded-2xl p-3 xl:hidden">
          <button type="button" className="btn-ghost" onClick={() => { setOpen(false); onNavigate("orbit"); }}>Globe</button>
          <button type="button" className="btn-ghost" disabled={!workspaceEnabled} onClick={() => { setOpen(false); onNavigate("workspace"); }}>Watershed</button>
          <ConnectBadge address={wallet.address} chain={network?.name ?? (wallet.chainId ? String(wallet.chainId) : null)} connecting={wallet.connecting} error={wallet.error} onConnect={() => void wallet.connect()} onDisconnect={wallet.disconnect} />
        </div>
      ) : null}
    </header>
  );
}

function ConnectBadge({
  address,
  chain,
  connecting,
  error,
  onConnect,
  onDisconnect,
}: {
  address: string | null;
  chain: string | null;
  connecting: boolean;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (!address) {
    return (
      <button type="button" className="btn-primary" onClick={onConnect} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }
  return (
    <button type="button" className="btn-ghost font-mono" onClick={onDisconnect} title={error ?? "Disconnect this session"}>
      {shortAddress(address)}
      {chain ? ` · ${chain}` : ""}
    </button>
  );
}

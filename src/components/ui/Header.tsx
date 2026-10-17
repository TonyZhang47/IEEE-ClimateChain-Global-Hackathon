"use client";

import type { ReactNode } from "react";
import { Droplets } from "lucide-react";
import { shortAddress } from "@/lib/utils";
import { useHydroWallet } from "@/lib/blockchain/web3Provider";

interface HeaderProps {
  stage: "orbit" | "descent" | "workspace";
  onNavigate: (stage: "orbit" | "workspace") => void;
  workspaceEnabled: boolean;
  children?: ReactNode;
}

export function Header({ stage, onNavigate, workspaceEnabled, children }: HeaderProps) {
  const wallet = useHydroWallet();

  return (
    <header className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl border border-aqua/40 bg-aqua/10 text-aqua">
          <Droplets size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold tracking-wide text-foam">HydroTrust AI</p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-mist">IEEE ClimateChain · resilience track</p>
        </div>
      </div>
      <nav className="flex items-center gap-2">
        <button
          type="button"
          className={stage !== "workspace" ? "btn-primary" : "btn-ghost"}
          onClick={() => onNavigate("orbit")}
        >
          Globe
        </button>
        <button
          type="button"
          className={stage === "workspace" ? "btn-primary" : "btn-ghost"}
          disabled={!workspaceEnabled}
          onClick={() => onNavigate("workspace")}
        >
          Watershed
        </button>
        {children}
        <span className="hidden rounded-full border border-line px-3 py-1 font-mono text-[11px] text-mist sm:inline">
          {wallet.address ? shortAddress(wallet.address) : "Wallet idle"}
        </span>
      </nav>
    </header>
  );
}

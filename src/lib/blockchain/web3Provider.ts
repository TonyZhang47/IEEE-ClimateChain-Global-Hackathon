"use client";

import { useEffect, useState } from "react";
import { BrowserProvider, type Eip1193Provider } from "ethers";
import type { OnChainTelemetry, WalletSnapshot } from "@/types/web3";
import {
  connectHydroTrust,
  contractAddress,
  expectedChainId,
  parseHistory,
} from "@/lib/blockchain/contractInterface";

const STORAGE_KEY = "hydrotrust.wallet.disconnected";

interface EthereumRequest {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface WalletStore extends WalletSnapshot {
  connect: () => Promise<void>;
  disconnect: () => void;
}

const listeners = new Set<() => void>();
let snapshot: WalletSnapshot = {
  address: null,
  chainId: null,
  error: null,
  connecting: false,
};

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setSnapshot(next: Partial<WalletSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  emit();
}

function ethereum(): EthereumRequest | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as Window & { ethereum?: EthereumRequest }).ethereum;
  if (!candidate || typeof candidate.request !== "function") return null;
  return candidate;
}

export function useHydroWallet(): WalletStore {
  const [local, setLocal] = useState<WalletSnapshot>(snapshot);

  useEffect(() => {
    const listener = () => setLocal({ ...snapshot });
    listeners.add(listener);
    void refreshSilent();
    const provider = ethereum();
    const onAccounts = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? args[0] : [];
      const first = accounts[0];
      setSnapshot({ address: typeof first === "string" ? first : null, error: null });
    };
    const onChain = (...args: unknown[]) => {
      const chain = args[0];
      setSnapshot({ chainId: typeof chain === "string" ? Number.parseInt(chain, 16) : null });
    };
    provider?.on?.("accountsChanged", onAccounts);
    provider?.on?.("chainChanged", onChain);
    return () => {
      listeners.delete(listener);
      provider?.removeListener?.("accountsChanged", onAccounts);
      provider?.removeListener?.("chainChanged", onChain);
    };
  }, []);

  return {
    ...local,
    connect,
    disconnect,
  };
}

async function refreshSilent(): Promise<void> {
  const provider = ethereum();
  if (!provider || window.localStorage.getItem(STORAGE_KEY) === "1") return;
  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    const chain = await provider.request({ method: "eth_chainId" });
    const first = Array.isArray(accounts) ? accounts[0] : null;
    setSnapshot({
      address: typeof first === "string" ? first : null,
      chainId: typeof chain === "string" ? Number.parseInt(chain, 16) : null,
      error: null,
    });
  } catch {
    setSnapshot({ error: null });
  }
}

export async function connect(): Promise<void> {
  const provider = ethereum();
  if (!provider) {
    setSnapshot({ error: "No injected wallet was found. Install MetaMask or another EIP-1193 wallet and reload." });
    return;
  }
  setSnapshot({ connecting: true, error: null });
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const chain = await provider.request({ method: "eth_chainId" });
    const first = Array.isArray(accounts) ? accounts[0] : null;
    if (typeof first !== "string") {
      setSnapshot({ connecting: false, error: "The wallet returned no account." });
      return;
    }
    setSnapshot({
      address: first,
      chainId: typeof chain === "string" ? Number.parseInt(chain, 16) : null,
      connecting: false,
      error: null,
    });
    await ensureExpectedChain();
  } catch (error) {
    setSnapshot({ connecting: false, error: walletError(error) });
  }
}

export function disconnect(): void {
  window.localStorage.setItem(STORAGE_KEY, "1");
  setSnapshot({ address: null, error: null, connecting: false });
}

export async function ensureExpectedChain(): Promise<void> {
  const wanted = expectedChainId();
  const provider = ethereum();
  if (!wanted || !provider) return;
  const current = await provider.request({ method: "eth_chainId" });
  const chainId = typeof current === "string" ? Number.parseInt(current, 16) : null;
  if (chainId === wanted) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${wanted.toString(16)}` }],
    });
    setSnapshot({ chainId: wanted, error: null });
  } catch (error) {
    setSnapshot({ error: walletError(error) });
    throw error;
  }
}

export async function recordTelemetryOnChain(
  location: string,
  flowRate: number,
  riskScore: number,
  ipfsCid: string,
): Promise<{ txHash: string; chainId: number }> {
  const { contract, chainId } = await signerContract();
  const tx = await contract.getFunction("recordTelemetry")(location, BigInt(flowRate), BigInt(riskScore), ipfsCid);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("The telemetry transaction was not confirmed.");
  }
  return { txHash: receipt.hash, chainId };
}

export async function mintCreditOnChain(to: string, amount: number): Promise<{ txHash: string; chainId: number }> {
  const { contract, chainId } = await signerContract();
  const tx = await contract.getFunction("mintWaterCredit")(to, BigInt(amount));
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("The mint transaction was not confirmed.");
  }
  return { txHash: receipt.hash, chainId };
}

export async function readCreditBalance(address: string): Promise<number | null> {
  const deployed = contractAddress();
  const provider = ethereum();
  if (!deployed || !provider) return null;
  try {
    const browser = new BrowserProvider(provider as Eip1193Provider);
    const contract = connectHydroTrust(deployed, browser);
    const balance: bigint = await contract.getFunction("balanceOf")(address);
    return Number(balance);
  } catch {
    return null;
  }
}

export async function readTelemetryHistory(location: string): Promise<OnChainTelemetry[]> {
  const deployed = contractAddress();
  const provider = ethereum();
  if (!deployed || !provider) return [];
  try {
    const browser = new BrowserProvider(provider as Eip1193Provider);
    const contract = connectHydroTrust(deployed, browser);
    const history: unknown = await contract.getFunction("getTelemetryHistory")(location);
    return parseHistory(history);
  } catch {
    return [];
  }
}

async function signerContract(): Promise<{ contract: ReturnType<typeof connectHydroTrust>; chainId: number }> {
  const deployed = contractAddress();
  if (!deployed) {
    throw new Error("Set NEXT_PUBLIC_HYDROTRUST_CONTRACT to a deployed HydroTrustVerifier address.");
  }
  const provider = ethereum();
  if (!provider) throw new Error("No injected wallet was found.");
  await ensureExpectedChain();
  const browser = new BrowserProvider(provider as Eip1193Provider);
  const signer = await browser.getSigner();
  const network = await browser.getNetwork();
  return { contract: connectHydroTrust(deployed, signer), chainId: Number(network.chainId) };
}

export function walletError(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const record = error as { code?: unknown; shortMessage?: unknown; message?: unknown };
    if (record.code === "ACTION_REJECTED" || record.code === 4001) return "The wallet declined the request.";
    if (typeof record.shortMessage === "string" && record.shortMessage.trim()) return record.shortMessage;
    if (typeof record.message === "string" && record.message.trim()) return record.message;
  }
  return "The wallet request failed.";
}

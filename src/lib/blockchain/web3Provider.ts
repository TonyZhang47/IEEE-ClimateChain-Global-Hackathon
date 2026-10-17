"use client";

import { useEffect, useState } from "react";
import { BrowserProvider, verifyMessage, type Eip1193Provider } from "ethers";
import { NETWORKS } from "@/lib/experience/catalog";
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

export interface AnnouncedWallet {
  name: string;
  rdns: string;
  provider: EthereumRequest;
}

const listeners = new Set<() => void>();
const announced: AnnouncedWallet[] = [];
let overrideProvider: EthereumRequest | null = null;
let watchingWallets = false;
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
  if (overrideProvider) return overrideProvider;
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
  overrideProvider = null;
  setSnapshot({ address: null, error: null, connecting: false });
}

export function requestWallets(): void {
  if (typeof window === "undefined") return;
  if (!watchingWallets) {
    watchingWallets = true;
    window.addEventListener("eip6963:announceProvider", (event: Event) => {
      const detail = (event as CustomEvent<{ info?: { name?: string; rdns?: string }; provider?: EthereumRequest }>).detail;
      if (!detail?.provider || !detail.info?.rdns) return;
      if (announced.some((item) => item.rdns === detail.info?.rdns)) return;
      announced.push({
        name: detail.info.name ?? detail.info.rdns,
        rdns: detail.info.rdns,
        provider: detail.provider,
      });
      emit();
    });
  }
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function useAnnouncedWallets(): AnnouncedWallet[] {
  const [list, setList] = useState<AnnouncedWallet[]>([]);
  useEffect(() => {
    const listener = () => setList([...announced]);
    listeners.add(listener);
    requestWallets();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return list;
}

export async function connectWith(provider: EthereumRequest): Promise<void> {
  overrideProvider = provider;
  await connect();
}

export async function switchNetwork(chainId: number): Promise<void> {
  const provider = ethereum();
  if (!provider) throw new Error("No injected wallet was found.");
  const hex = `0x${chainId.toString(16)}`;
  const network = NETWORKS.find((item) => item.chainId === chainId);
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : null;
    if (code !== 4902 || !network) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hex,
          chainName: network.name,
          nativeCurrency: {
            name: chainId === 80002 ? "POL" : "Ether",
            symbol: chainId === 80002 ? "POL" : "ETH",
            decimals: 18,
          },
          rpcUrls: [network.rpc],
          blockExplorerUrls: network.explorer ? [network.explorer] : [],
        },
      ],
    });
  }
  setSnapshot({ chainId, error: null });
}

export async function estimateRecordGas(
  location: string,
  flowRate: number,
  riskScore: number,
  ipfsCid: string,
): Promise<{ gas: string; feeEth: string | null }> {
  const { contract } = await signerContract();
  const gas: bigint = await contract.getFunction("recordTelemetry").estimateGas(location, BigInt(flowRate), BigInt(riskScore), ipfsCid);
  const provider = ethereum();
  if (!provider) return { gas: gas.toString(), feeEth: null };
  const browser = new BrowserProvider(provider as Eip1193Provider);
  const fee = await browser.getFeeData();
  const price = fee.maxFeePerGas ?? fee.gasPrice;
  const eth = price ? Number(gas * price) / 1e18 : null;
  return { gas: gas.toString(), feeEth: eth === null ? null : eth.toFixed(6) };
}

export async function signCanonical(message: string): Promise<{ signature: string; recovered: string }> {
  const provider = ethereum();
  if (!provider) throw new Error("No injected wallet was found.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const account = Array.isArray(accounts) ? accounts[0] : null;
  if (typeof account !== "string") throw new Error("The wallet returned no account.");
  const signature = await provider.request({ method: "personal_sign", params: [message, account] });
  if (typeof signature !== "string") throw new Error("The wallet did not return a signature.");
  return { signature, recovered: verifyMessage(message, signature) };
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

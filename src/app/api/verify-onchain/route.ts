import { JsonRpcProvider } from "ethers";
import { buildCommitment, chainDataHash, pinToWeb3Storage } from "@/lib/blockchain/commitment";
import { contractAddress, expectedChainId } from "@/lib/blockchain/contractInterface";
import { asNumber, asString, isRecord } from "@/lib/api/http";
import type { PreparedCommitment, TelemetryPayload } from "@/types/web3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const payload = readPayload(body);
  if (!payload) {
    return Response.json({ error: "Location, coordinates, and scores are required." }, { status: 400 });
  }

  const built = buildCommitment(payload);
  const pin = await pinToWeb3Storage(built.canonical, built.ipfsCid);
  const ipfsCid = pin.cid;
  const dataHash =
    ipfsCid === built.ipfsCid
      ? built.dataHash
      : chainDataHash(built.document.payload.location, built.document.payload.flowRateCfs, built.document.payload.floodIndex, ipfsCid);

  const address = contractAddress();
  const chainId = expectedChainId();
  let contractReady = false;
  let contractNote = "Deploy HydroTrustVerifier and set NEXT_PUBLIC_HYDROTRUST_CONTRACT before a wallet can record.";
  if (address && process.env.ETHEREUM_RPC_URL) {
    try {
      const provider = new JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
      const code = await provider.getCode(address);
      contractReady = code !== "0x" && code !== "0x0";
      contractNote = contractReady
        ? "Contract bytecode is present on the configured RPC."
        : "The configured address has no bytecode on the configured RPC.";
    } catch (error) {
      const message = error instanceof Error ? error.message : "RPC check failed";
      contractNote = `Bytecode was not confirmed (${message}).`;
    }
  } else if (address) {
    contractReady = false;
    contractNote = "Address is configured. Bytecode was not checked because ETHEREUM_RPC_URL is empty.";
  }

  const response: PreparedCommitment & { contractNote: string } = {
    ...built,
    ipfsCid,
    dataHash,
    pinned: pin.pinned,
    pinError: pin.pinError,
    contractAddress: address,
    chainId,
    contractReady,
    contractNote,
  };

  return Response.json(response);
}

function readPayload(body: unknown): TelemetryPayload | null {
  if (!isRecord(body)) return null;
  const location = asString(body.location);
  const latitude = asNumber(body.latitude);
  const longitude = asNumber(body.longitude);
  const flowRateCfs = asNumber(body.flowRateCfs);
  const floodIndex = asNumber(body.floodIndex);
  const blueCarbonIndex = asNumber(body.blueCarbonIndex);
  const sequestrationTco2ePerYear = asNumber(body.sequestrationTco2ePerYear);
  if (!location || latitude === null || longitude === null || flowRateCfs === null || floodIndex === null || blueCarbonIndex === null || sequestrationTco2ePerYear === null) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { location, latitude, longitude, flowRateCfs, floodIndex, blueCarbonIndex, sequestrationTco2ePerYear };
}

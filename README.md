# Proof Of Flow

Decentralized hydrological intelligence for the IEEE ClimateChain Global Hackathon. Search a place, read live stream telemetry, screen flood exposure and wetland carbon, and keep a content-addressed record you can commit on-chain.

**Live app:** [ieee-climate-chain-global-hackathon.vercel.app](https://ieee-climate-chain-global-hackathon.vercel.app/)

**Source:** [github.com/TonyZhang47/IEEE-ClimateChain-Global-Hackathon](https://github.com/TonyZhang47/IEEE-ClimateChain-Global-Hackathon)

## What it does

1. **Globe.** A React Three Fiber earth with NASA day and night imagery, a cloud layer, and an atmosphere shader. Choosing a place flies the camera from orbit down to that coordinate.
2. **Watershed map.** MapLibre renders 3D terrain from AWS terrarium elevation tiles. Stream lines are animated in the downstream direction. USGS gauge pins show live discharge in cubic feet per second.
3. **Flood index (0–100).** A screening score from stream proximity, terrain slope, and nearby discharge. It is not a FEMA flood map.
4. **Blue carbon.** Wetland area and an estimated sequestration rate in tonnes of CO₂e per year, scored on a saturating 0–100 scale.
5. **Advisory.** A plain-language community and policy brief. With an xAI or OpenAI key, a model writes it from the snapshot. Without a key, a deterministic writer uses only the computed numbers.
6. **Commitment.** Each snapshot is canonicalized, hashed with `keccak256`, and addressed as a raw CIDv1. A connected wallet can store that hash in `HydroTrustVerifier` and mint dREC stewardship credits when the flood index is 75 or below.
7. **Briefing PDF.** One export bundles the place, scores, gauge table, advisory, and verification hashes.

## Try it

Open the [live app](https://ieee-climate-chain-global-hackathon.vercel.app/) and pick a city, or type coordinates such as `41.6611, -91.5302`.

| Place | What you should see |
| --- | --- |
| Iowa City, New Orleans, Sacramento | USGS gauges, NHD flowlines, National Wetlands Inventory |
| Dhaka, Rotterdam | OpenStreetMap waterways. No USGS gauges; discharge uses stream density |
| Anywhere the hydrography services fail | A reproducible downhill flow model, labeled as a model |

Suggested first stop: **Iowa City**. The Iowa River gauge `05454500` is inside the search window, so the chart, flood index, and advisory all have a live discharge to cite.

## Scores

Flood vulnerability is the sum of three parts, clamped to 0–100:

| Part | Range | Reading |
| --- | --- | --- |
| Proximity | 0–40 | `40 × e^(−distance / 350 m)` to the nearest mapped stream |
| Slope | 0–30 | Low relief scores higher. A point sitting in a local depression is penalized further |
| Discharge | 0–30 | Log scale of the nearest gauge against 50,000 ft³/s. Stage is used if discharge is missing. Stream density is the last resort |

Confidence is **high** when a live gauge, elevation samples, and surveyed streams all contributed. It drops to **medium** or **low** as those inputs fall back to priors.

Blue carbon uses published-style class rates (salt marsh and mangrove highest, open lake and pond much lower). Annual sequestration is area times the class rate. The 0–100 rating saturates near 25 tCO₂e/yr inside the analysis window, so a large wetland complex reaches 100 and the hectare total stays visible beside it.

## On-chain credits

`contracts/HydroTrustVerifier.sol` stores telemetry and mints **dREC** (Decentralized Resilience Eco-Credit).

- `recordTelemetry(location, flowRate, riskScore, ipfsCid)` stores a record whose hash is `keccak256(abi.encodePacked(location, flowRate, riskScore, ipfsCid))`.
- `mintWaterCredit(to, amount)` requires the caller to have recorded telemetry, a latest flood index of 75 or below, and an amount no greater than `(100 − risk) × 10`. Mints are limited to once per hour per caller.
- `getTelemetryHistory(location)` returns the log for that place key, capped at 50 records.

The app computes the same hash and CID locally before you sign. If no contract address is configured, it keeps a **local commitment** and does not invent a transaction hash. Credits offered in the panel are `min(floor(sequestration × 10), on-chain cap)`.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run typecheck
npm run build
npm run compile:contracts
```

Node 18.18 or newer.

## Environment

Copy `.env.example` to `.env.local`. Every feature works with the file empty. Keys only upgrade optional steps.

| Variable | Role |
| --- | --- |
| `XAI_API_KEY`, `XAI_MODEL` | Advisory via the xAI API. Default model `grok-4` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Used when no xAI key is set. Default model `gpt-4o-mini` |
| `WEB3_STORAGE_TOKEN` | Attempts to pin the telemetry document. The local CIDv1 is always computed |
| `NEXT_PUBLIC_HYDROTRUST_CONTRACT` | Deployed `HydroTrustVerifier` address |
| `NEXT_PUBLIC_CHAIN_ID` | Chain the wallet should switch to. `31337` for a local Hardhat node |
| `ETHEREUM_RPC_URL` | Server-side bytecode check, and the Hardhat network RPC |
| `DEPLOYER_PRIVATE_KEY` | Signer for a public-network deploy. Never commit this |

On Vercel, set the same variables in the project settings. `NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing the contract address.

The hydrography route fans out to USGS, the wetlands inventory, and Overpass. Give that function at least 30 seconds. `src/app/api/hydro/route.ts` sets `maxDuration` to 60; the Vercel plan still has to allow it.

## Deploy the contract

Local node:

```bash
npx hardhat node
npm run deploy:local
```

The script writes `deployments/<network>-<chainId>.json` and prints:

```text
NEXT_PUBLIC_HYDROTRUST_CONTRACT=0x...
NEXT_PUBLIC_CHAIN_ID=31337
```

Put those in `.env.local` or in the Vercel environment, then restart or redeploy. For Sepolia, set `ETHEREUM_RPC_URL` and `DEPLOYER_PRIVATE_KEY` and run:

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

Foundry can compile the same file: `src` is `contracts/` and the compiler is 0.8.24 (`foundry.toml`).

## Data sources

| Source | Use |
| --- | --- |
| [Nominatim](https://nominatim.openstreetmap.org/) | Place search. Coordinate entry skips the geocoder |
| [USGS Instantaneous Values](https://waterservices.usgs.gov/nwis/iv/) | Discharge (parameter `00060`) and gage height (`00065`) |
| [USGS 3DEP elevation](https://epqs.nationalmap.gov/v1/json) | Point elevation and a 250 m slope cross |
| [National Hydrography Dataset](https://hydro.nationalmap.gov/) | U.S. flowlines |
| [National Wetlands Inventory](https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer) | U.S. wetland polygons and Cowardin classes |
| [OpenStreetMap Overpass](https://overpass-api.de/api/interpreter) | Streams and wetlands outside USGS coverage |
| [Esri Wayback](https://www.esri.com/en-us/arcgis/products/wayback-imagery) | Current and historic imagery toggle |
| [AWS terrain tiles](https://registry.opendata.aws/terrain-tiles/) | MapLibre 3D terrain |
| [OpenFreeMap](https://openfreemap.org/) | Dark vector basemap, with a CARTO raster fallback |

Public services rate-limit and occasionally return 5xx. The UI lists which sources answered in **Data notes**. A failed Overpass call does not hide a successful USGS response.

## Layout

```text
contracts/HydroTrustVerifier.sol     dREC verifier
scripts/deploy.js                    Hardhat deploy
src/app/page.tsx                     Globe, then watershed workspace
src/app/api/hydro                    Snapshot and gauge history
src/app/api/geocode                  Nominatim proxy
src/app/api/ai-analysis              Model advisory or deterministic fallback
src/app/api/verify-onchain           CID, keccak hash, mint eligibility
src/components/3d                    Globe, atmosphere shader, camera flight
src/components/map                   Terrain, animated flow, gauge pins
src/components/dashboard             Risk, chart, advisory, wallet panel
src/lib/gis                          Distance, slope, flood index, blue carbon
src/lib/api                          USGS, Overpass, Esri, snapshot assembly
src/lib/blockchain                   ABI, CID, wallet hook
src/lib/pdf                          Briefing export
```

## Stack

Next.js 14 (App Router), TypeScript, Tailwind CSS, Radix UI, Three.js and React Three Fiber, MapLibre GL, Turf.js, Recharts, Ethers v6, Hardhat, jsPDF.

## Desk tools

The workspace adds a layer panel, a scoring desk, and a chain desk on top of the original screen.

- **Globe.** The day/night boundary follows an approximate UTC solar position. Clouds are two shells. Delta beacons, inclined satellite rings, a bright-star backdrop, and polar particles are drawn in the scene. Rain particles appear only when the active flood index is 60 or higher. The coordinate readout is a raycast on the globe.
- **Map.** Terrain exaggeration, H3 cells, animated particles on the loaded flowlines, RainViewer radar, Open-Meteo rain and soil moisture, and NLDI basin / upstream / downstream traces are toggles. Buffer rings and the stage disk are geometric screens, not a hydraulic model. Walk rings assume 4 km/h in a straight line. The elevation profile is a USGS point sample every 200 m.
- **Scoring desk.** Component chart, local briefing, watershed questions, a labeled storm multiplier, gauge z-score, and the same core equations as `notebooks/hydro_score.py`. Insurance, restoration, and property figures are worksheets. The exposure index does not include census data. Headings can switch language; the measured narrative stays in English.
- **Chain desk.** Wallet switching uses EIP-1193 and EIP-6963. Gas estimates and signatures require a connected wallet and a deployed contract. Votes, order notes, and exploration marks stay in `localStorage`. The parametric line does not send USDC. The certificate is a preview, not an NFT. The contract source shown is the file in this repository.

`Ctrl/Cmd+K` opens the command palette. Arrow keys pan the map, `+/-` zoom, space recenters, and `M` toggles hydrography. Sound is off until the header button is pressed.

## Limits

The flood index and carbon rating are screening tools for a briefing. They are not a regulatory floodplain determination, an engineering design, or a carbon-registry issuance. dREC minted by this contract is a hackathon stewardship token with a hard cap and a cooldown, not a registered environmental credit.

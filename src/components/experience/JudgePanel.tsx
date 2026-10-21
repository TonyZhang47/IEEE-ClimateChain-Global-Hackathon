"use client";

const REPO = "https://github.com/TonyZhang47/IEEE-ClimateChain-Global-Hackathon";
const LIVE = "https://ieee-climate-chain-global-hackathon.vercel.app/";

export const REVIEW_STEPS = [
  {
    id: "impact",
    title: "Name the climate problem",
    body: "Flood response and wetland carbon both fail when the gauge, the map, and the score cannot be replayed together.",
  },
  {
    id: "hydro-map-canvas",
    title: "Show a live gauge",
    body: "Solid pins are USGS. Dashed lines are mapped flow. Open a pin for stage, discharge, and the trend.",
  },
  {
    id: "score-math",
    title: "Open the equation",
    body: "The flood index is proximity, slope, and discharge. It is a screen, not a FEMA map.",
  },
  {
    id: "chain-desk",
    title: "Stop on the hash",
    body: "The desk prepares keccak256 of the snapshot. The contract reverts if that hash was already stored, and it will not mint when the flood index is above 75.",
  },
] as const;

export function ImpactCard() {
  return (
    <section id="impact" className="glass rounded-2xl p-4 text-sm text-mist">
      <p className="text-[11px] uppercase tracking-[0.16em] text-aqua">Climate Data & Environmental Monitoring</p>
      <h2 className="mt-2 text-lg text-foam">One replayable record for the river and the wetland.</h2>
      <p className="mt-2 leading-6">
        A flood desk and a wetland project can cite the same river and still disagree, because the reading, the map, and the score live in different systems. Proof Of Flow binds the live gauge, the mapped streams, and the screening score into one snapshot, then stores the hash.
      </p>
      <p className="mt-2 leading-6">
        HydroTrustVerifier stores that environmental snapshot once. A duplicate hash reverts, and stewardship credits stay off when the flood index is above 75.
      </p>
    </section>
  );
}

export function JudgePanel({ onBegin }: { onBegin?: () => void }) {
  const video = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL;
  return (
    <div className="space-y-4 text-sm text-mist">
      <p className="text-foam">
        Track: Climate Data & Environmental Monitoring. One environmental snapshot, one hash, so the same reading can be verified again.
      </p>
      <p>
        Users are a municipal flood desk and a wetland-carbon project. Both can open a city or a USGS site id, read the screen, export a PDF, and optionally commit the hash. There is no account.
      </p>
      {onBegin ? (
        <button type="button" className="btn-primary" onClick={onBegin}>
          Open Iowa City
        </button>
      ) : null}
      <ol className="space-y-2">
        {REVIEW_STEPS.map((step, index) => (
          <li key={step.id}>
            <span className="text-foam">{index + 1}. {step.title}. </span>
            {step.body}
          </li>
        ))}
      </ol>
      <div>
        <p className="text-foam">Three-minute recording script</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Open the live app and say the problem: the river and the wetland are not one record.</li>
          <li>Press Open Iowa City. Let the globe land. Point at a solid USGS pin and the dashed flowlines.</li>
          <li>Open How this score is computed. Say it is a screen, not a flood map.</li>
          <li>Scroll to the chain desk. Read the hash. Say a second copy of that hash reverts, and credits stay off when flood risk is high.</li>
          <li>Close on who uses it, and paste the GitHub link in the description.</li>
        </ol>
      </div>
      <p>
        <a className="text-aqua underline-offset-4 hover:underline" href={LIVE} target="_blank" rel="noreferrer">
          Live app
        </a>
        {" · "}
        <a className="text-aqua underline-offset-4 hover:underline" href={REPO} target="_blank" rel="noreferrer">
          GitHub repository
        </a>
        {" · "}
        <a className="text-aqua underline-offset-4 hover:underline" href="/HydroTrustVerifier.sol" target="_blank" rel="noreferrer">
          Contract source
        </a>
      </p>
      {video ? <video className="w-full rounded-xl" controls src={video} /> : <p>Add the pitch video URL with NEXT_PUBLIC_DEMO_VIDEO_URL when the recording is ready.</p>}
    </div>
  );
}

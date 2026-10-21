import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Proof Of Flow";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#071116",
          color: "#e7f4f1",
          padding: "64px",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 6, color: "#3ddec0" }}>IEEE CLIMATECHAIN · RESILIENCE TRACK</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 84, fontWeight: 650 }}>Proof Of Flow</div>
          <div style={{ fontSize: 32, color: "#9db4b0", maxWidth: 860 }}>
            Live watershed telemetry, a screening score, and a hash you can put on-chain.
          </div>
        </div>
      </div>
    ),
    size,
  );
}

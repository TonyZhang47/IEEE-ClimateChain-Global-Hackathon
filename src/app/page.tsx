"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { AdvisoryReport, GaugeReading, HydroSnapshot, PlaceSuggestion } from "@/types/hydro";
import type { PreparedCommitment, VerificationRecord } from "@/types/web3";
import { AIInsightPanel } from "@/components/dashboard/AIInsightPanel";
import { RiskMetricsCard } from "@/components/dashboard/RiskMetricsCard";
import { TelemetryChart } from "@/components/dashboard/TelemetryChart";
import { Web3VerifierPanel } from "@/components/dashboard/Web3VerifierPanel";
import { GaugeDetail } from "@/components/map/StreamGaugeLayer";
import { Header } from "@/components/ui/Header";
import { Modal } from "@/components/ui/Modal";
import { PDFReportButton } from "@/components/ui/PDFReportButton";
import { SearchBar } from "@/components/ui/SearchBar";
import { EXAMPLE_PLACES } from "@/lib/utils";

const GlobeViewer = dynamic(() => import("@/components/3d/GlobeViewer").then((mod) => mod.GlobeViewer), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-mist">Raising the globe…</div>,
});

const HydrologyMap = dynamic(() => import("@/components/map/HydrologyMap").then((mod) => mod.HydrologyMap), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-mist">Opening the watershed…</div>,
});

type Stage = "orbit" | "descent" | "workspace";

const EMPTY_STREAMS: HydroSnapshot["streams"] = { type: "FeatureCollection", features: [] };
const EMPTY_WETLANDS: HydroSnapshot["wetlandGeometry"] = { type: "FeatureCollection", features: [] };

export default function HomePage() {
  const [stage, setStage] = useState<Stage>("orbit");
  const [place, setPlace] = useState<PlaceSuggestion | null>(null);
  const [snapshot, setSnapshot] = useState<HydroSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advisory, setAdvisory] = useState<AdvisoryReport | null>(null);
  const [commitment, setCommitment] = useState<PreparedCommitment | null>(null);
  const [verification, setVerification] = useState<VerificationRecord | null>(null);
  const [gauge, setGauge] = useState<GaugeReading | null>(null);

  const loadPlace = useCallback(async (next: PlaceSuggestion) => {
    setPlace(next);
    setSnapshot(null);
    setAdvisory(null);
    setCommitment(null);
    setVerification(null);
    setError(null);
    setLoading(true);
    setStage("descent");
    try {
      const response = await fetch(
        `/api/hydro?lat=${next.latitude}&lon=${next.longitude}&label=${encodeURIComponent(next.label)}`,
      );
      const body: unknown = await response.json();
      if (!response.ok || !isSnapshot(body)) {
        throw new Error(readError(body) ?? "The watershed request failed.");
      }
      setSnapshot(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The watershed request failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (stage !== "descent") return;
    const timer = window.setTimeout(() => setStage("workspace"), 4600);
    return () => window.clearTimeout(timer);
  }, [stage, place]);

  const onArrival = useCallback(() => {
    setStage((current) => (current === "descent" ? "workspace" : current));
  }, []);

  const primary = snapshot?.gauges.find((item) => item.siteId === snapshot.primarySiteId) ?? snapshot?.gauges[0] ?? null;

  return (
    <main className="min-h-screen">
      {stage !== "workspace" ? (
        <section className="relative h-screen overflow-hidden">
          <GlobeViewer
            target={place ? { latitude: place.latitude, longitude: place.longitude, label: place.label } : null}
            onArrival={onArrival}
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col">
            <div className="pointer-events-auto">
              <Header
                stage={stage}
                workspaceEnabled={Boolean(place)}
                onNavigate={(next) => {
                  if (next === "workspace" && place) setStage("workspace");
                  if (next === "orbit") setStage("orbit");
                }}
              />
            </div>
            <div className="pointer-events-none flex flex-1 items-end px-4 pb-10 sm:px-8">
              <div className="pointer-events-auto max-w-xl">
                <p className="text-[11px] uppercase tracking-[0.22em] text-aqua">Climate resilience screen</p>
                <h1 className="mt-3 max-w-lg text-4xl leading-tight text-foam sm:text-5xl">
                  Read the watershed before the water rises.
                </h1>
                <p className="mt-3 max-w-lg text-sm leading-6 text-mist">
                  Live USGS gauges where the network exists, OpenStreetMap hydrography elsewhere, and a local score when no model key is configured. The chain stores a hash, not a guess.
                </p>
                <div className="mt-5">
                  <SearchBar onSelect={(next) => void loadPlace(next)} initialLabel={place?.label ?? ""} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {EXAMPLE_PLACES.map((example) => (
                    <button
                      key={example.id}
                      type="button"
                      className="btn-ghost"
                      onClick={() => void loadPlace({ ...example })}
                    >
                      {example.label.split(",")[0]}
                    </button>
                  ))}
                </div>
                {stage === "descent" && place ? (
                  <p className="mt-4 text-sm text-aqua" role="status">
                    Descending toward {place.label.split(",")[0]}
                    {loading ? " · syncing gauges and streams" : ""}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="flex h-screen flex-col">
          <Header
            stage={stage}
            workspaceEnabled
            onNavigate={(next) => {
              if (next === "orbit") setStage("orbit");
            }}
          />
          <div className="px-4 pb-3 sm:px-6">
            <SearchBar variant="compact" onSelect={(next) => void loadPlace(next)} initialLabel={place?.label ?? ""} />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.9fr)]">
            <div id="hydro-map-canvas" className="relative min-h-[420px] border-y border-line lg:border-y-0 lg:border-r">
              {place ? (
                <HydrologyMap
                  key={`${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}`}
                  latitude={place.latitude}
                  longitude={place.longitude}
                  label={place.label}
                  streams={snapshot?.streams ?? EMPTY_STREAMS}
                  wetlands={snapshot?.wetlandGeometry ?? EMPTY_WETLANDS}
                  gauges={snapshot?.gauges ?? []}
                  wayback={snapshot?.wayback ?? null}
                  streamSource={snapshot?.streamSource ?? "overpass"}
                  onSelectGauge={setGauge}
                />
              ) : null}
            </div>
            <aside className="min-h-0 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
              {loading ? <p className="text-sm text-mist">Pulling USGS, hydrography, and elevation…</p> : null}
              {error ? (
                <div className="rounded-2xl border border-coral/40 bg-coral/10 p-4 text-sm text-foam">
                  <p>{error}</p>
                  {place ? (
                    <button type="button" className="btn-ghost mt-3" onClick={() => void loadPlace(place)}>
                      Retry
                    </button>
                  ) : null}
                </div>
              ) : null}
              {snapshot ? (
                <>
                  <RiskMetricsCard risk={snapshot.risk} blueCarbon={snapshot.blueCarbon} />
                  <TelemetryChart
                    series={snapshot.series}
                    siteLabel={primary ? `${primary.siteName} · ${primary.siteId}` : null}
                  />
                  <AIInsightPanel snapshot={snapshot} onReport={setAdvisory} />
                  <Web3VerifierPanel
                    snapshot={snapshot}
                    onCommitment={setCommitment}
                    onVerification={setVerification}
                  />
                  {snapshot.notices.length > 0 ? (
                    <details className="rounded-2xl border border-line px-4 py-3 text-sm text-mist">
                      <summary className="cursor-pointer text-foam">Data notes</summary>
                      <ul className="mt-3 space-y-2">
                        {snapshot.notices.map((notice) => (
                          <li key={notice}>{notice}</li>
                        ))}
                      </ul>
                      <p className="mt-3 text-xs">{snapshot.sources.join(" · ")}</p>
                    </details>
                  ) : null}
                  <PDFReportButton
                    snapshot={snapshot}
                    advisory={advisory}
                    commitment={commitment}
                    verification={verification}
                  />
                </>
              ) : null}
            </aside>
          </div>
        </section>
      )}
      <Modal
        open={Boolean(gauge)}
        onOpenChange={(open) => {
          if (!open) setGauge(null);
        }}
        title={gauge ? `USGS ${gauge.siteId}` : "Gauge"}
        description="Instantaneous values from the USGS water services."
      >
        {gauge ? <GaugeDetail gauge={gauge} /> : null}
      </Modal>
    </main>
  );
}

function isSnapshot(value: unknown): value is HydroSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<HydroSnapshot>;
  return Boolean(record.place && record.risk && record.blueCarbon && record.streams);
}

function readError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("error" in value)) return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

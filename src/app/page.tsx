"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdvisoryReport, GaugeReading, HydroSnapshot, PlaceSuggestion } from "@/types/hydro";
import type { PreparedCommitment, VerificationRecord } from "@/types/web3";
import { AIInsightPanel } from "@/components/dashboard/AIInsightPanel";
import { AnalysisDeck } from "@/components/dashboard/AnalysisDeck";
import { ChainStudio } from "@/components/dashboard/ChainStudio";
import { RiskMetricsCard } from "@/components/dashboard/RiskMetricsCard";
import { TelemetryChart } from "@/components/dashboard/TelemetryChart";
import { Web3VerifierPanel } from "@/components/dashboard/Web3VerifierPanel";
import { CommandPalette, DemoVideo, HealthFooter, Soundscape, ToastHost, Tour } from "@/components/experience/Chrome";
import { ErrorBoundary } from "@/components/experience/ErrorBoundary";
import { GaugeDetail } from "@/components/map/StreamGaugeLayer";
import { Header } from "@/components/ui/Header";
import { Modal } from "@/components/ui/Modal";
import { PDFReportButton } from "@/components/ui/PDFReportButton";
import { SearchBar } from "@/components/ui/SearchBar";
import { pushToast } from "@/lib/experience/toasts";
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
const CACHE_KEY = "hydrotrust.snapshot";

export default function HomePage() {
  const [stage, setStage] = useState<Stage>("orbit");
  const [place, setPlace] = useState<PlaceSuggestion | null>(null);
  const [snapshot, setSnapshot] = useState<HydroSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [advisory, setAdvisory] = useState<AdvisoryReport | null>(null);
  const [commitment, setCommitment] = useState<PreparedCommitment | null>(null);
  const [verification, setVerification] = useState<VerificationRecord | null>(null);
  const [gauge, setGauge] = useState<GaugeReading | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [sound, setSound] = useState(false);
  const [cinema, setCinema] = useState(false);
  const booted = useRef(false);

  const loadPlace = useCallback(async (next: PlaceSuggestion) => {
    setPlace(next);
    setSnapshot(null);
    setAdvisory(null);
    setCommitment(null);
    setVerification(null);
    setError(null);
    setOffline(false);
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
      cacheSnapshot(body);
    } catch (reason) {
      const cached = readCachedSnapshot(next);
      if (cached) {
        setSnapshot(cached);
        setOffline(true);
        setError("Live services did not respond. Showing the last saved snapshot for this place.");
      } else {
        setError(reason instanceof Error ? reason.message : "The watershed request failed.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const params = new URLSearchParams(window.location.search);
    const latitude = Number(params.get("lat"));
    const longitude = Number(params.get("lng") ?? params.get("lon"));
    const label = params.get("label") ?? "";
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && label.length > 1) {
      void loadPlace({ id: "link", label, latitude, longitude });
    }
    if (window.localStorage.getItem("hydrotrust.tour") !== "1") setTourOpen(true);
    if (window.localStorage.getItem("hydrotrust.theme") === "light") {
      document.documentElement.dataset.theme = "light";
    }
  }, [loadPlace]);

  useEffect(() => {
    if (!place || stage === "orbit") return;
    const url = new URL(window.location.href);
    url.searchParams.set("lat", place.latitude.toFixed(5));
    url.searchParams.set("lng", place.longitude.toFixed(5));
    url.searchParams.set("label", place.label);
    window.history.replaceState(null, "", url);
  }, [place, stage]);

  useEffect(() => {
    if (stage !== "descent") return;
    const timer = window.setTimeout(() => setStage("workspace"), 4600);
    return () => window.clearTimeout(timer);
  }, [stage, place]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onArrival = useCallback(() => {
    setStage((current) => (current === "descent" ? "workspace" : current));
  }, []);

  const onCommand = (action: "orbit" | "workspace" | "fullscreen" | "tour" | "sound" | "theme") => {
    if (action === "orbit") setStage("orbit");
    if (action === "workspace" && place) setStage("workspace");
    if (action === "fullscreen") toggleCinema(setCinema);
    if (action === "tour") setTourOpen(true);
    if (action === "sound") setSound((current) => !current);
    if (action === "theme") toggleTheme();
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setError("This browser did not provide geolocation.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void loadPlace({
          id: "gps",
          label: "Browser location",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => setError("Location permission was not granted."),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  const primary = snapshot?.gauges.find((item) => item.siteId === snapshot.primarySiteId) ?? snapshot?.gauges[0] ?? null;
  const tools = (
    <>
      <button type="button" className="btn-ghost" onClick={() => setPaletteOpen(true)}>Search</button>
      <button type="button" className={sound ? "btn-primary" : "btn-ghost"} onClick={() => setSound((current) => !current)}>
        {sound ? "Sound on" : "Sound"}
      </button>
      <button type="button" className="btn-ghost" onClick={toggleTheme}>Theme</button>
      <button type="button" className="btn-ghost" onClick={() => toggleCinema(setCinema)}>{cinema ? "Panels" : "Cinema"}</button>
      <DemoVideo />
    </>
  );

  return (
    <main className="min-h-screen">
      <Soundscape enabled={sound} />
      <ToastHost />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onSelect={(next) => void loadPlace(next)} onAction={onCommand} />
      <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
      {stage !== "workspace" ? (
        <section className="relative h-screen overflow-hidden">
          <GlobeViewer
            target={place ? { latitude: place.latitude, longitude: place.longitude, label: place.label } : null}
            floodScore={snapshot?.risk.score ?? null}
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
              >
                {tools}
              </Header>
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
                    <button key={example.id} type="button" className="btn-ghost" onClick={() => void loadPlace({ ...example })}>
                      {example.label.split(",")[0]}
                    </button>
                  ))}
                  <button type="button" className="btn-ghost" onClick={locate}>Near me</button>
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
          >
            {tools}
          </Header>
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
            <div className="min-w-[240px] flex-1">
              <SearchBar variant="compact" onSelect={(next) => void loadPlace(next)} initialLabel={place?.label ?? ""} />
            </div>
            <button type="button" className="btn-ghost" onClick={locate}>Near me</button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                void navigator.clipboard.writeText(window.location.href);
                pushToast("Link copied.");
              }}
            >
              Copy link
            </button>
          </div>
          <div className={`grid min-h-0 flex-1 grid-cols-1 ${cinema ? "" : "lg:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.9fr)]"}`}>
            <div id="hydro-map-canvas" className="relative min-h-[420px] border-y border-line lg:border-y-0 lg:border-r">
              {place ? (
                <ErrorBoundary label="Map">
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
                </ErrorBoundary>
              ) : null}
            </div>
            {cinema ? null : (
              <aside className="min-h-0 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
                {loading ? (
                  <>
                    <div className="skeleton" />
                    <div className="skeleton" />
                    <div className="skeleton" />
                  </>
                ) : null}
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
                {offline ? <p className="text-xs text-amber">Offline copy. Refresh when the network is back.</p> : null}
                {snapshot ? (
                  <ErrorBoundary label="Desk">
                    <RiskMetricsCard risk={snapshot.risk} blueCarbon={snapshot.blueCarbon} />
                    <TelemetryChart
                      series={snapshot.series}
                      siteLabel={primary ? `${primary.siteName} · ${primary.siteId}` : null}
                    />
                    <AnalysisDeck snapshot={snapshot} />
                    <AIInsightPanel snapshot={snapshot} onReport={setAdvisory} />
                    <Web3VerifierPanel
                      snapshot={snapshot}
                      onCommitment={setCommitment}
                      onVerification={setVerification}
                    />
                    <ChainStudio snapshot={snapshot} commitment={commitment} />
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
                  </ErrorBoundary>
                ) : null}
              </aside>
            )}
          </div>
          <HealthFooter />
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

function toggleTheme(): void {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  if (next === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  window.localStorage.setItem("hydrotrust.theme", next);
}

function toggleCinema(setCinema: (value: (current: boolean) => boolean) => void): void {
  setCinema((current) => !current);
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  void document.documentElement.requestFullscreen().catch(() => undefined);
}

function cacheSnapshot(snapshot: HydroSnapshot): void {
  try {
    const slim: HydroSnapshot = {
      ...snapshot,
      streams: { ...snapshot.streams, features: snapshot.streams.features.slice(0, 40) },
      wetlandGeometry: { ...snapshot.wetlandGeometry, features: snapshot.wetlandGeometry.features.slice(0, 20) },
      series: snapshot.series.slice(-48),
    };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(slim));
  } catch {
    // The browser refused the cache. The live view still works.
  }
}

function readCachedSnapshot(place: PlaceSuggestion): HydroSnapshot | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshot(parsed)) return null;
    const near = Math.abs(parsed.place.latitude - place.latitude) < 0.02 && Math.abs(parsed.place.longitude - place.longitude) < 0.02;
    return near ? parsed : null;
  } catch {
    return null;
  }
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

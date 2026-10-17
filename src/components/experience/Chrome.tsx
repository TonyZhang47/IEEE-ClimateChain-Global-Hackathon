"use client";

import { useEffect, useState } from "react";
import type { PlaceSuggestion } from "@/types/hydro";
import { CASE_STUDIES, parseConversationalQuery } from "@/lib/experience/catalog";
import { Modal } from "@/components/ui/Modal";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelect: (place: PlaceSuggestion) => void;
  onAction: (action: "orbit" | "workspace" | "fullscreen" | "tour" | "sound" | "theme") => void;
}

export function CommandPalette({ open, onClose, onSelect, onAction }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  if (!open) return null;
  const needle = parseConversationalQuery(query).toLowerCase();
  const places = CASE_STUDIES.filter((place) => place.label.toLowerCase().includes(needle) || place.note.toLowerCase().includes(needle));
  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-black/50 px-4 pt-[12vh]" onClick={onClose}>
      <div className="glass w-full max-w-xl rounded-2xl p-3" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Jump to a watershed or a command"
          className="w-full bg-transparent px-2 py-2 text-sm text-foam outline-none"
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Enter" && places[0]) {
              onSelect(places[0]);
              onClose();
            }
          }}
        />
        <ul className="mt-2 max-h-72 overflow-auto">
          {places.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-foam hover:bg-white/10"
                onClick={() => {
                  onSelect(place);
                  onClose();
                }}
              >
                {place.label}
                <span className="mt-1 block text-xs text-mist">{place.note}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-1">
          <button type="button" className="btn-ghost" onClick={() => { onAction("orbit"); onClose(); }}>Globe</button>
          <button type="button" className="btn-ghost" onClick={() => { onAction("workspace"); onClose(); }}>Watershed</button>
          <button type="button" className="btn-ghost" onClick={() => { onAction("fullscreen"); onClose(); }}>Cinema</button>
          <button type="button" className="btn-ghost" onClick={() => { onAction("sound"); onClose(); }}>Sound</button>
          <button type="button" className="btn-ghost" onClick={() => { onAction("theme"); onClose(); }}>Theme</button>
          <button type="button" className="btn-ghost" onClick={() => { onAction("tour"); onClose(); }}>Tour</button>
        </div>
      </div>
    </div>
  );
}

const TOUR = [
  "Search a city or paste coordinates. Iowa City is the fullest live example.",
  "The globe flies to that coordinate, then the map opens with terrain, streams, and gauges.",
  "The flood index and blue-carbon rating are screening math. Open the equation drawer to recompute them.",
  "A wallet can record the keccak hash. If no contract address is configured, the panel stops at a local commitment.",
];

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  if (!open) return null;
  const text = TOUR[step] ?? TOUR[0];
  return (
    <div className="fixed bottom-6 left-1/2 z-40 w-[min(32rem,calc(100%-2rem))] -translate-x-1/2">
      <div className="glass rounded-2xl p-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-aqua">Tour {step + 1} / {TOUR.length}</p>
        <p className="mt-2 text-sm text-foam">{text}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (step >= TOUR.length - 1) {
                window.localStorage.setItem("hydrotrust.tour", "1");
                onClose();
                return;
              }
              setStep((current) => current + 1);
            }}
          >
            {step >= TOUR.length - 1 ? "Done" : "Next"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              window.localStorage.setItem("hydrotrust.tour", "1");
              onClose();
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

export function Soundscape({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const context = new AudioContext();
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 380;
    const gain = context.createGain();
    gain.gain.value = 0.025;
    source.connect(filter).connect(gain).connect(context.destination);
    void context.resume();
    source.start();
    return () => {
      source.stop();
      void context.close();
    };
  }, [enabled]);
  return null;
}

interface HealthPayload {
  probes: { name: string; ok: boolean; ms: number }[];
  xaiConfigured: boolean;
  openaiConfigured: boolean;
  contractConfigured: boolean;
}

export function HealthFooter() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetch("/api/health")
        .then(async (response) => {
          const body: unknown = await response.json();
          if (!response.ok || !isHealth(body)) throw new Error("Health check failed.");
          if (!cancelled) {
            setHealth(body);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) setError(reason instanceof Error ? reason.message : "Health check failed.");
        });
    };
    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const line = health
    ? health.probes.map((probe) => `${probe.name} ${probe.ok ? `${probe.ms} ms` : "down"}`).join(" · ")
    : error ?? "Checking services…";
  const models = health
    ? `xAI ${health.xaiConfigured ? "key set" : "off"} · OpenAI ${health.openaiConfigured ? "key set" : "off"} · contract ${health.contractConfigured ? "set" : "off"}`
    : "";

  return (
    <footer className="border-t border-line px-4 py-2 text-[11px] text-mist sm:px-6">
      <p>{line}</p>
      {models ? <p className="mt-1">{models}</p> : null}
    </footer>
  );
}

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== "string") return;
      setMessage(detail);
      window.setTimeout(() => setMessage((current) => (current === detail ? null : current)), 4200);
    };
    window.addEventListener("hydrotrust-toast", onToast);
    return () => window.removeEventListener("hydrotrust-toast", onToast);
  }, []);
  if (!message) return null;
  return (
    <div className="glass fixed bottom-6 right-4 z-50 max-w-sm rounded-2xl px-4 py-3 text-sm text-foam" role="status">
      {message}
    </div>
  );
}

export function DemoVideo() {
  const url = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL;
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>Demo</button>
      <Modal open={open} onOpenChange={setOpen} title="Demo" description="Opens the configured demo video.">
        <video className="w-full rounded-xl" controls src={url} />
      </Modal>
    </>
  );
}

export function useFirstTour(): [boolean, () => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (window.localStorage.getItem("hydrotrust.tour") === "1") return;
    setOpen(true);
  }, []);
  return [open, () => setOpen(false)];
}

function isHealth(value: unknown): value is HealthPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<HealthPayload>;
  return Array.isArray(record.probes);
}

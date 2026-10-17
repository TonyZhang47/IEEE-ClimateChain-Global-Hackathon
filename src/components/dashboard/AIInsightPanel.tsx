"use client";

import { useEffect, useRef, useState } from "react";
import type { AdvisoryReport, HydroSnapshot } from "@/types/hydro";

interface AIInsightPanelProps {
  snapshot: HydroSnapshot;
  onReport: (report: AdvisoryReport | null) => void;
}

export function AIInsightPanel({ snapshot, onReport }: AIInsightPanelProps) {
  const [report, setReport] = useState<AdvisoryReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const onReportRef = useRef(onReport);
  onReportRef.current = onReport;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const slim: HydroSnapshot = {
      ...snapshot,
      streams: { type: "FeatureCollection", features: [] },
      wetlandGeometry: { type: "FeatureCollection", features: [] },
    };
    void fetch("/api/ai-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slim),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok || !isAdvisory(body)) {
          throw new Error(readError(body) ?? "The advisory could not be written.");
        }
        setReport(body);
        onReportRef.current(body);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        const message = reason instanceof Error ? reason.message : "The advisory failed.";
        setError(message);
        onReportRef.current(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [snapshot]);

  return (
    <section className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-mist">Advisory</p>
        {report ? (
          <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-aqua">
            {report.confidence === "model" ? report.model ?? "model" : "deterministic"}
          </span>
        ) : null}
      </div>
      {loading ? <p className="mt-4 text-sm text-mist">Writing the briefing from this snapshot…</p> : null}
      {error ? <p className="mt-4 text-sm text-coral">{error}</p> : null}
      {report ? (
        <div className="mt-3 space-y-3">
          <h3 className="text-lg leading-snug text-foam">{report.headline}</h3>
          <p className="text-sm leading-6 text-mist">{report.summary}</p>
          {report.notice ? <p className="text-xs text-amber">{report.notice}</p> : null}
          <ActionList title="Community" items={report.communityActions} />
          <ActionList title="Policy" items={report.policyActions} />
        </div>
      ) : null}
    </section>
  );
}

function ActionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-mist">{title}</p>
      <ul className="mt-2 space-y-2 text-sm text-foam">
        {items.map((item) => (
          <li key={item} className="border-l border-aqua/50 pl-3">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function isAdvisory(value: unknown): value is AdvisoryReport {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<AdvisoryReport>;
  return typeof record.headline === "string" && typeof record.summary === "string" && Array.isArray(record.communityActions);
}

function readError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("error" in value)) return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

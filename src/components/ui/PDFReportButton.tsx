"use client";

import { FileDown } from "lucide-react";
import { useState } from "react";
import html2canvas from "html2canvas";
import type { AdvisoryReport, HydroSnapshot } from "@/types/hydro";
import type { PreparedCommitment, VerificationRecord } from "@/types/web3";
import { buildHydroReport, downloadBlob } from "@/lib/pdf/reportGenerator";

interface PDFReportButtonProps {
  snapshot: HydroSnapshot;
  advisory: AdvisoryReport | null;
  commitment: PreparedCommitment | null;
  verification: VerificationRecord | null;
}

export function PDFReportButton({ snapshot, advisory, commitment, verification }: PDFReportButtonProps) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const exportReport = async () => {
    setBusy(true);
    setNote(null);
    let mapImage: string | null = null;
    let mapNote: string | null = null;
    const node = document.getElementById("hydro-map-canvas");
    if (node) {
      try {
        const canvas = await html2canvas(node, {
          useCORS: true,
          backgroundColor: "#071116",
          scale: 1,
          logging: false,
        });
        mapImage = canvas.toDataURL("image/png");
      } catch {
        mapNote = "Map image omitted because a basemap tile did not allow canvas export.";
      }
    } else {
      mapNote = "Map image omitted because the watershed view was not mounted.";
    }

    try {
      const blob = buildHydroReport({ snapshot, advisory, commitment, verification, mapImage, mapNote });
      const slug = snapshot.place.label.split(",")[0]?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "watershed";
      downloadBlob(blob, `proof-of-flow-${slug}.pdf`);
      setNote(mapNote);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The PDF could not be built.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button type="button" className="btn-primary w-full" onClick={() => void exportReport()} disabled={busy}>
        <FileDown size={16} />
        {busy ? "Composing brief…" : "Export briefing PDF"}
      </button>
      {note ? <p className="mt-2 text-xs text-mist">{note}</p> : null}
    </div>
  );
}

import { jsPDF } from "jspdf";
import type { AdvisoryReport, HydroSnapshot } from "@/types/hydro";
import type { PreparedCommitment, VerificationRecord } from "@/types/web3";

export interface ReportInput {
  snapshot: HydroSnapshot;
  advisory: AdvisoryReport | null;
  commitment: PreparedCommitment | null;
  verification: VerificationRecord | null;
  mapImage: string | null;
  mapNote: string | null;
}

export function buildHydroReport(input: ReportInput): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 0;

  const paintHeader = () => {
    doc.setFillColor(7, 17, 22);
    doc.rect(0, 0, pageWidth, 28, "F");
    doc.setFillColor(61, 222, 192);
    doc.rect(0, 28, pageWidth, 1.2, "F");
    doc.setTextColor(231, 244, 241);
    doc.setFont("times", "bold");
    doc.setFontSize(16);
    doc.text("Proof Of Flow", margin, 12);
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(157, 180, 176);
    doc.text("Hydrological screening brief  ·  IEEE ClimateChain", margin, 18);
    doc.text(input.snapshot.fetchedAt.replace("T", " ").replace("Z", " UTC"), pageWidth - margin, 18, {
      align: "right",
    });
    y = 38;
  };

  const ensure = (height: number) => {
    if (y + height <= pageHeight - 16) return;
    doc.addPage();
    paintHeader();
  };

  const paragraph = (text: string, size = 10.5) => {
    doc.setFont("times", "normal");
    doc.setFontSize(size);
    doc.setTextColor(28, 42, 46);
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2) as string[];
    ensure(lines.length * 5 + 2);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 2;
  };

  const heading = (text: string) => {
    ensure(12);
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.setTextColor(12, 48, 52);
    doc.text(text, margin, y);
    y += 7;
  };

  paintHeader();
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.setTextColor(12, 28, 32);
  const title = doc.splitTextToSize(input.snapshot.place.label, pageWidth - margin * 2) as string[];
  doc.text(title, margin, y);
  y += title.length * 7 + 1;
  paragraph(
    `${input.snapshot.place.latitude.toFixed(5)}, ${input.snapshot.place.longitude.toFixed(5)}  ·  stream source ${sourceLabel(input.snapshot.streamSource)}`,
    10,
  );

  if (input.mapImage) {
    ensure(78);
    try {
      doc.addImage(input.mapImage, "PNG", margin, y, pageWidth - margin * 2, 70);
      y += 74;
    } catch {
      paragraph("The map image could not be embedded.");
    }
  } else if (input.mapNote) {
    paragraph(input.mapNote);
  }

  heading("Flood vulnerability");
  const risk = input.snapshot.risk;
  paragraph(
    `Index ${risk.score}/100  ·  confidence ${risk.confidence}. Proximity ${risk.proximityComponent}/40, slope ${risk.slopeComponent}/30, discharge ${risk.dischargeComponent}/30.`,
  );
  paragraph(
    `Elevation ${risk.elevationM === null ? "unavailable" : `${risk.elevationM.toFixed(1)} m`}  ·  slope ${risk.slopePercent === null ? "unavailable" : `${risk.slopePercent.toFixed(2)}%`}  ·  nearest stream ${risk.nearestStreamMeters === null ? "unavailable" : `${Math.round(risk.nearestStreamMeters)} m`}.`,
  );
  for (const line of risk.rationale) paragraph(line, 10);

  heading("Blue carbon");
  const carbon = input.snapshot.blueCarbon;
  paragraph(
    `Rating ${carbon.score}/100  ·  ${carbon.wetlandAreaHa.toFixed(2)} ha  ·  ${carbon.annualSequestrationTco2e.toFixed(2)} tCO2e/yr  ·  dominant type ${carbon.dominantType}.`,
  );
  for (const line of carbon.rationale) paragraph(line, 10);

  heading("Gauges");
  if (input.snapshot.gauges.length === 0) {
    paragraph("No USGS instantaneous gauge was returned for this window.");
  } else {
    for (const gauge of input.snapshot.gauges.slice(0, 8)) {
      const flow = gauge.dischargeCfs === null ? "discharge n/a" : `${Math.round(gauge.dischargeCfs).toLocaleString("en-US")} cfs`;
      const stage = gauge.gageHeightFt === null ? "stage n/a" : `${gauge.gageHeightFt.toFixed(2)} ft`;
      paragraph(`${gauge.siteId}  ${gauge.siteName}  ·  ${flow}  ·  ${stage}  ·  ${Math.round(gauge.distanceMeters).toLocaleString("en-US")} m`);
    }
  }

  if (input.advisory) {
    heading("Advisory");
    paragraph(input.advisory.headline, 12);
    paragraph(input.advisory.summary);
    paragraph(`Source: ${input.advisory.confidence === "model" ? input.advisory.model ?? "language model" : "deterministic scorer"}.`);
    if (input.advisory.notice) paragraph(input.advisory.notice, 9);
    heading("Community actions");
    input.advisory.communityActions.forEach((action, index) => paragraph(`${index + 1}. ${action}`));
    heading("Policy actions");
    input.advisory.policyActions.forEach((action, index) => paragraph(`${index + 1}. ${action}`));
  }

  heading("Verification");
  if (!input.commitment) {
    paragraph("A content commitment has not been prepared yet.");
  } else {
    paragraph(`Content hash ${input.commitment.dataHash}`);
    paragraph(`IPFS CID ${input.commitment.ipfsCid}`);
    paragraph(input.commitment.pinned ? "The document was accepted by the storage API." : input.commitment.pinError ?? "The CID is local.");
    paragraph(input.commitment.eligibilityReason);
  }
  if (input.verification?.txHash) {
    paragraph(`Telemetry transaction ${input.verification.txHash} (${input.verification.status}).`);
  } else {
    paragraph("No telemetry transaction has been confirmed for this briefing.");
  }
  if (input.verification?.mintTxHash) {
    paragraph(`Credit mint transaction ${input.verification.mintTxHash}.`);
  }

  heading("Sources");
  paragraph(input.snapshot.sources.join(" · ") || "None recorded.");
  for (const notice of input.snapshot.notices) paragraph(notice, 9);

  ensure(16);
  doc.setFont("times", "italic");
  doc.setFontSize(8);
  doc.setTextColor(90, 106, 108);
  doc.text(
    "Screening product. Do not use as a flood insurance determination, engineering design, or carbon-registry issuance without a qualified review.",
    margin,
    Math.min(y + 4, pageHeight - 12),
    { maxWidth: pageWidth - margin * 2 },
  );

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("times", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 136, 136);
    doc.text(`${page} / ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  return doc.output("blob");
}

function sourceLabel(source: HydroSnapshot["streamSource"]): string {
  if (source === "nhd") return "USGS NHD";
  if (source === "overpass") return "OpenStreetMap";
  return "deterministic downhill model";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

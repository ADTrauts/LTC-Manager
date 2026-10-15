import PDFDocument from "pdfkit";

import type { ComplianceAttachmentRef, ComplianceReport } from "./types";

const MAX_EMBED_BYTES = 1_200_000;

export async function renderCompliancePdf(
  report: ComplianceReport,
  images: ReadonlyMap<string, Buffer> = new Map(),
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "LETTER",
    margin: 48,
    bufferPages: true,
    compress: false,
    info: {
      Title: `${report.metadata.templateName} compliance report`,
      Author: "LTC Manager",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.fontSize(16).text(report.metadata.facilityName);
  doc.fontSize(11).text(report.metadata.departmentName);
  doc.moveDown(0.3);
  doc.fontSize(14).text(reportTitle(report));
  doc.fontSize(10).fillColor("#333").text(`${report.metadata.fromDateKey} to ${report.metadata.toDateKey}`);
  doc.text(`Generated ${report.metadata.generatedAt} (${report.metadata.timezone}) by ${report.metadata.generatedBy}`);
  if (report.metadata.filters.length > 0) doc.text(`Filters: ${report.metadata.filters.join("; ")}`);
  if (report.versions.length > 0) {
    doc.text(
      `Template versions represented: ${report.versions.map((row) => `v${row.version} — ${row.records} records`).join("; ")}`,
    );
  }
  doc.moveDown();
  doc.fillColor("#000").fontSize(12).text("Summary");
  doc.fontSize(10);
  doc.text(`Expected ${report.summary.expected}`);
  doc.text(`Completed ${report.summary.completed}`);
  doc.text(`Missed ${report.summary.missed}`);
  doc.text(`Overdue ${report.summary.overdue}`);
  doc.text(`Waived ${report.summary.waived}`);
  if (report.summary.notYetDue > 0) doc.text(`Not yet due ${report.summary.notYetDue}`);
  if (report.summary.needsSetup > 0) doc.text(`Needs setup ${report.summary.needsSetup}`);
  if (report.summary.needsReview > 0) doc.text(`Needs review ${report.summary.needsReview}`);
  doc.text(`Exceptions ${report.summary.exceptions}`);
  if (report.summary.averageInspectionScore != null) {
    doc.text(`Average inspection score ${report.summary.averageInspectionScore}%`);
    doc.text(`Failed inspections ${report.summary.failedInspections}`);
    doc.text(`Critical failures ${report.summary.criticalFailures}`);
  }
  for (const line of report.templateLines) {
    const score = line.averageInspectionScore == null ? "" : ` · Average ${line.averageInspectionScore}%`;
    doc.text(`${line.line}${score}`);
  }

  doc.moveDown();
  doc.fontSize(12).text("Records");
  doc.fontSize(9);
  for (const row of report.records) {
    ensureSpace(doc, 48);
    const slot = row.slot;
    const value = slot.record?.valueNumber ?? slot.record?.valueText ?? "—";
    const window = slot.windowStartLocal ? `${slot.windowStartLocal}–${slot.windowEndLocal ?? ""}` : "";
    doc.text(
      `${slot.serviceDate}  ${slot.placeLabel ?? "—"}  ${window}  ${value}  ${slot.record?.recordedByLabel ?? ""}  ${row.statusLabel}${row.corrected ? "  Corrected" : ""}`,
    );
    if (slot.inspection?.percentage != null) {
      doc.text(`Score ${slot.inspection.percentage}%  ${slot.inspection.outcome ?? ""}  Critical failures ${slot.inspection.criticalFailureCount}`);
      for (const section of slot.inspection.sectionScores ?? []) {
        doc.text(`${section.label} ${section.earnedPoints}/${section.possiblePoints}${section.percentage != null ? ` ${section.percentage}%` : ""}`);
      }
      for (const question of slot.inspection.questions) {
        const mark = question.notApplicable ? "—" : question.outOfStandard ? "x" : "ok";
        doc.text(`  ${mark}  ${question.field}: ${question.response}`);
      }
    }
    for (const repeat of slot.repeatResponses ?? []) {
      const mark = repeat.outOfStandard ? "Out of standard" : "In standard";
      const rowLabel = repeat.row ? ` ${repeat.row}` : "";
      doc.text(`  ${repeat.group}${rowLabel} · ${repeat.column}: ${repeat.value}${repeat.unit ? ` ${repeat.unit}` : ""} · ${repeat.group === "Calculated" ? "" : mark}`.trim());
    }
    if (slot.waiver) doc.text(`Waiver: ${slot.waiver.reason}`);
    if (row.issueLabel) doc.text(`Issue: ${row.issueLabel}`);
  }

  if (report.exceptions.length > 0) {
    doc.moveDown();
    doc.fontSize(12).text("Exceptions");
    doc.fontSize(9);
    for (const row of report.exceptions) {
      ensureSpace(doc, 64);
      const slot = row.slot;
      doc.text(
        `${slot.serviceDate} ${slot.placeLabel ?? ""} ${slot.record?.valueNumber ?? slot.record?.valueText ?? ""}`,
      );
      if (slot.record?.correctiveActionText) doc.text(`Corrective action: ${slot.record.correctiveActionText}`);
      for (const follow of slot.followUps) {
        doc.text(`Recheck: ${follow.valueNumber ?? "Recorded"}${follow.outOfStandard ? "" : " — In standard"}`);
      }
    }
  }

  const photos = report.attachments.filter((item) => item.kind === "PHOTO");
  const files = report.attachments.filter((item) => item.kind === "FILE");
  const signatures = report.attachments.filter((item) => item.kind === "SIGNATURE");
  if (photos.length > 0 || files.length > 0 || signatures.length > 0) {
    doc.moveDown();
    doc.fontSize(12).text("Attachments");
    doc.fontSize(9);
    for (const photo of photos) embedImage(doc, photo, images);
    for (const signature of signatures) {
      embedImage(doc, signature, images);
      doc.text(`Signed by: ${signature.signedBy ?? "the signed-in person"}`);
      if (signature.signedAt) doc.text(`Signed at: ${signature.signedAt}`);
    }
    if (files.length > 0) {
      doc.text("Supporting attachments:");
      for (const file of files) doc.text(`- ${file.filename}`);
    }
  }

  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i += 1) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor("#444").text(
      `Generated from LTC Manager  ·  ${report.metadata.templateName}  ·  Page ${i + 1} of ${pages.count}`,
      48,
      doc.page.height - 36,
      { lineBreak: false },
    );
  }
  doc.end();
  return done;
}

function reportTitle(report: ComplianceReport): string {
  const form = report.slots[0]?.recordForm;
  if (form === "Inspection") return `${report.metadata.templateName} inspection report`;
  if (report.metadata.templateName.toLowerCase().includes("temperature")) {
    return `${report.metadata.templateName} temperature log`;
  }
  return `${report.metadata.templateName} compliance report`;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y > doc.page.height - 72 - needed) doc.addPage();
}

function embedImage(doc: PDFKit.PDFDocument, attachment: ComplianceAttachmentRef, images: ReadonlyMap<string, Buffer>) {
  const bytes = images.get(attachment.id);
  doc.text(attachment.filename);
  if (!bytes) return;
  if (bytes.length > MAX_EMBED_BYTES) {
    doc.text("Image omitted from this packet because the original is large. The stored evidence file is unchanged.");
    return;
  }
  if (!attachment.contentType.startsWith("image/")) return;
  try {
    ensureSpace(doc, 140);
    doc.image(bytes, { fit: [220, 120] });
    doc.moveDown();
  } catch {
    doc.text("Image could not be placed in this packet.");
  }
}

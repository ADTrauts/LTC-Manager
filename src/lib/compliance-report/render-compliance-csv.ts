import { auditRecordsToCsv } from "@/lib/audit/audit-records";

import type { ComplianceCsvMode, ComplianceReport } from "./types";

export function renderComplianceCsv(report: ComplianceReport, mode: ComplianceCsvMode): string {
  if (mode === "slots") return auditRecordsToCsv(report.slots);
  const header = [
    "recordId",
    "serviceDate",
    "location",
    "section",
    "field",
    "response",
    "unit",
    "notApplicable",
    "outOfStandard",
    "scoreWeight",
    "earned",
    "critical",
    "template",
    "templateVersion",
    "auditScore",
    "auditOutcome",
    "correctiveAction",
    "group",
    "row",
  ];
  const lines = [header.join(",")];
  const byRecord = new Map(report.records.map((row) => [row.recordId, row]));
  for (const response of report.responses) {
    const record = byRecord.get(response.recordId);
    const slot = record?.slot;
    lines.push(
      [
        csv(response.recordId),
        response.serviceDate,
        csv(response.location),
        csv(response.section),
        csv(response.field),
        csv(response.response),
        csv(response.unit),
        response.notApplicable ? "true" : "false",
        response.outOfStandard ? "true" : "false",
        response.scoreWeight ?? "",
        response.earned ?? "",
        response.critical ? "true" : "false",
        csv(slot?.definitionLabel ?? report.metadata.templateName),
        slot?.record?.templateVersion ?? slot?.catalogVersion ?? "",
        slot?.inspection?.percentage ?? "",
        slot?.inspection?.outcome ?? "",
        csv(slot?.record?.correctiveActionText ?? ""),
        csv(response.group ?? ""),
        csv(response.row ?? ""),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function csv(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

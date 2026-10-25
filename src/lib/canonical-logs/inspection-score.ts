/**
 * Derived inspection score. The template snapshot and submitted answers are the authority.
 * Nothing here writes an audit result row.
 */

import { evaluateEvidenceRules, parseCatalogEvidenceRules } from "@/lib/canonical-logs/evidence-rules";
import { parseLogSubmissionSnapshot, type LogSubmissionSnapshotV2 } from "@/lib/canonical-logs/snapshot";
import type { EvidenceFieldValueInput } from "@/lib/operational-evidence/types";

export const COMPLIANCE_RESPONSES = ["COMPLIANT", "NON_COMPLIANT", "NOT_APPLICABLE"] as const;
export type ComplianceResponse = (typeof COMPLIANCE_RESPONSES)[number];

export const INSPECTION_OUTCOMES = ["PASS", "PASS_WITH_EXCEPTIONS", "FAIL"] as const;
export type InspectionOutcome = (typeof INSPECTION_OUTCOMES)[number];

export type InspectionSectionDefinition = {
  sectionKey: string;
  label: string;
  description?: string | null;
  displaySequence: number;
};

export type InspectionScoreField = {
  fieldKey: string;
  label: string;
  fieldType: string;
  displaySequence?: number;
  sectionKey?: string | null;
  scoreWeight?: number | null;
  critical?: boolean;
  creditValues?: string[];
  minNumber?: number | null;
  maxNumber?: number | null;
  unitLabel?: string | null;
};

export type InspectionScoreInput = {
  purposeType: string;
  passingScore?: number | null;
  criticalFailureForcesFailure?: boolean;
  sections?: readonly InspectionSectionDefinition[];
  fields: readonly InspectionScoreField[];
  values: readonly EvidenceFieldValueInput[];
  /** Active fields. Hidden conditional fields are omitted by the caller or by scoreInspectionSnapshot. */
  visibleFieldKeys: readonly string[];
};

export type InspectionSectionScore = {
  sectionKey: string;
  label: string;
  earnedPoints: number;
  possiblePoints: number;
  percentage: number | null;
};

export type InspectionScoreException = {
  fieldKey: string;
  label: string;
  display: string;
  critical: boolean;
};

export type InspectionScore = {
  earnedPoints: number;
  possiblePoints: number;
  percentage: number | null;
  sectionScores: InspectionSectionScore[];
  criticalFailures: InspectionScoreException[];
  exceptions: InspectionScoreException[];
  outcome: InspectionOutcome | null;
};

export function isComplianceResponse(value: string | null | undefined): value is ComplianceResponse {
  return value === "COMPLIANT" || value === "NON_COMPLIANT" || value === "NOT_APPLICABLE";
}

export function complianceResponseLabel(value: string | null | undefined): string {
  if (value === "COMPLIANT") return "Compliant";
  if (value === "NON_COMPLIANT") return "Non-Compliant";
  if (value === "NOT_APPLICABLE") return "N/A";
  return value?.trim() || "—";
}

/** A failed inspection is out of standard, so the Record can be rechecked. */
export function inspectionFailureMarksOutOfStandard(
  outcome: InspectionOutcome | null | undefined,
): boolean {
  return outcome === "FAIL";
}

export function inspectionOutcomeLabel(outcome: InspectionOutcome | null): string {
  if (outcome === "PASS") return "Pass";
  if (outcome === "PASS_WITH_EXCEPTIONS") return "Pass with exceptions";
  if (outcome === "FAIL") return "Fail";
  return "";
}

export function formatInspectionPercentage(percentage: number | null): string {
  if (percentage == null) return "";
  return Number.isInteger(percentage) ? `${percentage}%` : `${percentage}%`;
}

export function formatInspectionLogBookLine(score: InspectionScore | null): string | null {
  if (!score || score.percentage == null || !score.outcome) return null;
  return `${formatInspectionPercentage(score.percentage)} · ${inspectionOutcomeLabel(score.outcome)}`;
}

export function parseInspectionSections(raw: unknown): InspectionSectionDefinition[] {
  if (!Array.isArray(raw)) return [];
  const sections: InspectionSectionDefinition[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const sectionKey = typeof record.sectionKey === "string" ? record.sectionKey.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!sectionKey || !label) continue;
    const description = typeof record.description === "string" ? record.description : null;
    const displaySequence =
      typeof record.displaySequence === "number" && Number.isFinite(record.displaySequence)
        ? record.displaySequence
        : sections.length + 1;
    sections.push({ sectionKey, label, description, displaySequence });
  }
  return sections.sort((a, b) => a.displaySequence - b.displaySequence || a.sectionKey.localeCompare(b.sectionKey));
}

function roundPercentage(earned: number, possible: number): number | null {
  if (possible <= 0) return null;
  return Math.round((earned / possible) * 1000) / 10;
}

function answerText(value: EvidenceFieldValueInput | undefined): string {
  return value?.valueText?.trim() ?? "";
}

function scoredWeight(field: InspectionScoreField): number | null {
  if (field.scoreWeight == null || !Number.isFinite(field.scoreWeight) || field.scoreWeight <= 0) return null;
  return field.scoreWeight;
}

function fullCredit(field: InspectionScoreField, value: EvidenceFieldValueInput | undefined): boolean {
  const credits = (field.creditValues ?? []).map((item) => item.trim()).filter(Boolean);
  if (field.fieldType === "NUMBER" || field.fieldType === "TEMPERATURE") {
    const n = value?.valueNumber;
    if (n == null || !Number.isFinite(n)) return false;
    if (field.minNumber != null && n < field.minNumber) return false;
    if (field.maxNumber != null && n > field.maxNumber) return false;
    return true;
  }
  if (field.fieldType === "COMPLIANCE") {
    const text = answerText(value);
    if (credits.length > 0) return credits.includes(text);
    return text === "COMPLIANT";
  }
  const text = answerText(value);
  if (credits.length > 0) return credits.includes(text);
  if (value?.valueBoolean === true) return true;
  return false;
}

function displayAnswer(field: InspectionScoreField, value: EvidenceFieldValueInput | undefined): string {
  if (field.fieldType === "COMPLIANCE") return complianceResponseLabel(answerText(value));
  if (field.fieldType === "NUMBER" || field.fieldType === "TEMPERATURE") {
    if (value?.valueNumber == null) return "—";
    const unit = field.unitLabel?.trim() ? ` ${field.unitLabel.trim()}` : "";
    return `${value.valueNumber}${unit}`;
  }
  return answerText(value) || "—";
}

export function evaluateInspectionScore(input: InspectionScoreInput): InspectionScore | null {
  if (input.purposeType !== "INSPECTION") return null;
  const visible = new Set(input.visibleFieldKeys);
  const values = new Map(input.values.map((value) => [value.fieldKey, value]));
  const sections = [...(input.sections ?? [])].sort(
    (a, b) => a.displaySequence - b.displaySequence || a.sectionKey.localeCompare(b.sectionKey),
  );
  const sectionByKey = new Map(sections.map((section) => [section.sectionKey, section]));

  type Bucket = { earned: number; possible: number };
  const buckets = new Map<string, Bucket>();
  const exceptions: InspectionScoreException[] = [];
  let earnedPoints = 0;
  let possiblePoints = 0;

  const ordered = [...input.fields].sort(
    (a, b) => (a.displaySequence ?? 0) - (b.displaySequence ?? 0) || a.fieldKey.localeCompare(b.fieldKey),
  );

  for (const field of ordered) {
    if (!visible.has(field.fieldKey)) continue;
    const weight = scoredWeight(field);
    if (weight == null) continue;
    const value = values.get(field.fieldKey);
    if (field.fieldType === "COMPLIANCE" && answerText(value) === "NOT_APPLICABLE") continue;
    const sectionKey = field.sectionKey?.trim() || "";
    const bucket = buckets.get(sectionKey) ?? { earned: 0, possible: 0 };
    bucket.possible += weight;
    possiblePoints += weight;
    if (fullCredit(field, value)) {
      bucket.earned += weight;
      earnedPoints += weight;
    } else {
      exceptions.push({
        fieldKey: field.fieldKey,
        label: field.label,
        display: displayAnswer(field, value),
        critical: field.critical === true,
      });
    }
    buckets.set(sectionKey, bucket);
  }

  const sectionScores: InspectionSectionScore[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    seen.add(section.sectionKey);
    const bucket = buckets.get(section.sectionKey);
    if (!bucket || bucket.possible <= 0) continue;
    sectionScores.push({
      sectionKey: section.sectionKey,
      label: section.label,
      earnedPoints: bucket.earned,
      possiblePoints: bucket.possible,
      percentage: roundPercentage(bucket.earned, bucket.possible),
    });
  }
  for (const [sectionKey, bucket] of buckets) {
    if (seen.has(sectionKey) || bucket.possible <= 0) continue;
    const defined = sectionByKey.get(sectionKey);
    sectionScores.push({
      sectionKey,
      label: defined?.label || (sectionKey ? sectionKey : "General"),
      earnedPoints: bucket.earned,
      possiblePoints: bucket.possible,
      percentage: roundPercentage(bucket.earned, bucket.possible),
    });
  }

  const percentage = roundPercentage(earnedPoints, possiblePoints);
  const criticalFailures = exceptions.filter((row) => row.critical);
  let outcome: InspectionOutcome | null = null;
  if (possiblePoints > 0 && percentage != null) {
    const belowThreshold =
      input.passingScore != null && Number.isFinite(input.passingScore) && percentage < input.passingScore;
    const forced =
      input.criticalFailureForcesFailure === true && criticalFailures.length > 0;
    if (belowThreshold || forced) outcome = "FAIL";
    else if (exceptions.length > 0) outcome = "PASS_WITH_EXCEPTIONS";
    else outcome = "PASS";
  }

  return {
    earnedPoints,
    possiblePoints,
    percentage,
    sectionScores,
    criticalFailures,
    exceptions,
    outcome,
  };
}

type SnapshotField = LogSubmissionSnapshotV2["catalog"]["fields"][number] & InspectionScoreField;

export function scoreInspectionSnapshot(input: {
  snapshot: LogSubmissionSnapshotV2 | null;
  values: readonly EvidenceFieldValueInput[];
}): InspectionScore | null {
  const snapshot = input.snapshot;
  if (!snapshot || snapshot.catalog.purposeType !== "INSPECTION") return null;
  const fields = snapshot.catalog.fields as SnapshotField[];
  const rules = parseCatalogEvidenceRules(snapshot.catalog.rules);
  const evaluation = evaluateEvidenceRules({
    fields: fields.map((field) => ({
      fieldKey: field.fieldKey,
      label: field.label,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      displaySequence: field.displaySequence,
      helpText: field.helpText,
      unitLabel: field.unitLabel,
      minNumber: field.minNumber,
      maxNumber: field.maxNumber,
      allowedSelections: field.allowedSelections,
      correctiveActionTrigger: field.correctiveActionTrigger,
      correctiveActionRequired: field.correctiveActionRequired,
    })),
    rules,
    values: input.values,
  });
  const catalog = snapshot.catalog as LogSubmissionSnapshotV2["catalog"] & {
    passingScore?: number | null;
    criticalFailureForcesFailure?: boolean;
    sections?: InspectionSectionDefinition[];
  };
  return evaluateInspectionScore({
    purposeType: snapshot.catalog.purposeType,
    passingScore: catalog.passingScore ?? null,
    criticalFailureForcesFailure: catalog.criticalFailureForcesFailure === true,
    sections: catalog.sections ?? [],
    fields,
    values: input.values,
    visibleFieldKeys: evaluation.visibleFieldKeys,
  });
}

export function scoreInspectionSnapshotJson(input: {
  templateSnapshotJson: unknown;
  values: readonly EvidenceFieldValueInput[];
}): InspectionScore | null {
  return scoreInspectionSnapshot({
    snapshot: parseLogSubmissionSnapshot(input.templateSnapshotJson),
    values: input.values,
  });
}

export type InspectionReviewSummary = {
  completed: number;
  scored: number;
  averagePercentage: number | null;
  failed: number;
  criticalFailures: number;
  exceptionCount: number;
  byTemplate: Array<{
    templateKey: string;
    label: string;
    completed: number;
    averagePercentage: number | null;
    failed: number;
    criticalFailures: number;
  }>;
};

export function summarizeInspectionReviews(
  rows: readonly {
    templateKey: string;
    label: string;
    score: InspectionScore | null;
  }[],
): InspectionReviewSummary {
  const completedRows = rows.filter((row) => row.score);
  const scoredRows = completedRows.filter((row) => row.score?.percentage != null);
  const averagePercentage =
    scoredRows.length === 0
      ? null
      : Math.round(
          (scoredRows.reduce((sum, row) => sum + (row.score?.percentage ?? 0), 0) / scoredRows.length) * 10,
        ) / 10;
  const byKey = new Map<string, InspectionReviewSummary["byTemplate"][number] & { scoreSum: number; scored: number }>();
  for (const row of completedRows) {
    const current = byKey.get(row.templateKey) ?? {
      templateKey: row.templateKey,
      label: row.label,
      completed: 0,
      averagePercentage: null,
      failed: 0,
      criticalFailures: 0,
      scoreSum: 0,
      scored: 0,
    };
    current.completed += 1;
    if (row.score?.outcome === "FAIL") current.failed += 1;
    if ((row.score?.criticalFailures.length ?? 0) > 0) current.criticalFailures += 1;
    if (row.score?.percentage != null) {
      current.scoreSum += row.score.percentage;
      current.scored += 1;
    }
    byKey.set(row.templateKey, current);
  }
  return {
    completed: completedRows.length,
    scored: scoredRows.length,
    averagePercentage,
    failed: completedRows.filter((row) => row.score?.outcome === "FAIL").length,
    criticalFailures: completedRows.filter((row) => (row.score?.criticalFailures.length ?? 0) > 0).length,
    exceptionCount: completedRows.reduce((sum, row) => sum + (row.score?.exceptions.length ?? 0), 0),
    byTemplate: [...byKey.values()]
      .map((row) => ({
        templateKey: row.templateKey,
        label: row.label,
        completed: row.completed,
        averagePercentage: row.scored === 0 ? null : Math.round((row.scoreSum / row.scored) * 10) / 10,
        failed: row.failed,
        criticalFailures: row.criticalFailures,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export function inspectionEvidenceToCsv(
  rows: readonly {
    template: string;
    version: string | number;
    operationalDate: string;
    location: string;
    actor: string;
    score: string;
    outcome: string;
    criticalFailureCount: string | number;
    field: string;
    response: string;
    notApplicable: boolean;
    outOfStandard: boolean;
    correctiveAction: string;
  }[],
): string {
  const header = [
    "template",
    "version",
    "operationalDate",
    "location",
    "actor",
    "auditScore",
    "auditOutcome",
    "criticalFailureCount",
    "field",
    "response",
    "notApplicable",
    "outOfStandard",
    "correctiveAction",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvCell(row.template),
        String(row.version),
        row.operationalDate,
        csvCell(row.location),
        csvCell(row.actor),
        row.score,
        csvCell(row.outcome),
        String(row.criticalFailureCount),
        csvCell(row.field),
        csvCell(row.response),
        row.notApplicable ? "true" : "false",
        row.outOfStandard ? "true" : "false",
        csvCell(row.correctiveAction),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

import type { MealType } from "@prisma/client";

import type { CoverageLevel } from "./coverage-list";
import { buildStaffingHref } from "./coverage-list";

export const CALL_DOWN_REASON_PREFIX = "[call-down:";

export const CALL_DOWN_REASON_TEMPLATES = [
  { key: "call-off", label: "Call-off" },
  { key: "no-call-no-show", label: "No call / no show" },
  { key: "late-arrival", label: "Late arrival" },
  { key: "reassigned-for-coverage", label: "Reassigned for coverage" },
  { key: "emergency-coverage", label: "Emergency coverage" },
] as const;

export type CallDownTemplateKey = (typeof CALL_DOWN_REASON_TEMPLATES)[number]["key"];

export type ParsedCallDownReason = {
  isCallDown: boolean;
  templateKey: CallDownTemplateKey | null;
  templateLabel: string | null;
  details: string | null;
  displayReason: string;
};

export type CallDownStatus = "open" | "covered";

export type CallDownOverrideRecord = {
  id: string;
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  oldUnitId: string | null;
  oldUnitName: string | null;
  newUnitId: string;
  newUnitName: string;
  mealType: MealType | null;
  reason: string;
  changedAt: Date;
};

export type CallDownItem = {
  id: string;
  employeeName: string;
  templateKey: CallDownTemplateKey | null;
  templateLabel: string | null;
  reason: string;
  reasonDetails: string | null;
  oldUnitId: string | null;
  oldUnitName: string | null;
  newUnitId: string;
  newUnitName: string;
  mealType: MealType | null;
  status: CallDownStatus;
  statusLabel: string;
  changedAt: Date;
  staffingHref: string;
  coverageHref: string;
};

export type CallDownSummary = {
  total: number;
  open: number;
  covered: number;
};

export type CallDownData = {
  items: CallDownItem[];
  summary: CallDownSummary;
  dateIso: string;
};

const TEMPLATE_BY_KEY = new Map<string, string>(
  CALL_DOWN_REASON_TEMPLATES.map((template) => [template.key, template.label]),
);

export function isCallDownTemplateKey(value: string): value is CallDownTemplateKey {
  return TEMPLATE_BY_KEY.has(value);
}

export function formatCallDownReason(templateKey: CallDownTemplateKey, details?: string | null): string {
  const trimmed = details?.trim();
  if (trimmed) {
    return `${CALL_DOWN_REASON_PREFIX}${templateKey}] ${trimmed}`;
  }
  return `${CALL_DOWN_REASON_PREFIX}${templateKey}]`;
}

export function parseCallDownReason(reason: string): ParsedCallDownReason {
  const match = /^\[call-down:([a-z0-9-]+)\](?:\s*(.*))?$/i.exec(reason.trim());
  if (!match) {
    return {
      isCallDown: false,
      templateKey: null,
      templateLabel: null,
      details: null,
      displayReason: reason.trim(),
    };
  }

  const templateKey = match[1] ?? null;
  const details = match[2]?.trim() || null;
  const templateLabel = templateKey ? TEMPLATE_BY_KEY.get(templateKey) ?? null : null;

  return {
    isCallDown: templateLabel !== null,
    templateKey: templateLabel && templateKey && isCallDownTemplateKey(templateKey) ? templateKey : null,
    templateLabel,
    details,
    displayReason: templateLabel
      ? details
        ? `${templateLabel}: ${details}`
        : templateLabel
      : reason.trim(),
  };
}

export function resolveOverrideReasonFromForm(input: {
  reasonTemplate?: string | null;
  reasonDetails?: string | null;
  reason?: string | null;
}): string {
  const template = input.reasonTemplate?.trim();
  const details = input.reasonDetails?.trim();
  const freeText = input.reason?.trim();

  if (template && isCallDownTemplateKey(template)) {
    return formatCallDownReason(template, details);
  }

  if (freeText && freeText.length >= 3) {
    return freeText;
  }

  if (details && details.length >= 3) {
    return details;
  }

  throw new Error("Reason must be at least 3 characters.");
}

export function resolveCallDownStatus(
  override: Pick<CallDownOverrideRecord, "oldUnitId">,
  coverageByUnitId: Map<string, CoverageLevel>,
): CallDownStatus {
  if (!override.oldUnitId) {
    return "open";
  }
  const level = coverageByUnitId.get(override.oldUnitId);
  return level === "covered" ? "covered" : "open";
}

export function resolveCallDownStatusLabel(status: CallDownStatus): string {
  return status === "open" ? "Needs coverage" : "Covered";
}

export function buildCallDownItems(args: {
  overrides: CallDownOverrideRecord[];
  coverageByUnitId: Map<string, CoverageLevel>;
  dateIso: string;
}): CallDownItem[] {
  return args.overrides
    .map((override) => {
      const parsed = parseCallDownReason(override.reason);
      if (!parsed.isCallDown) {
        return null;
      }

      const status = resolveCallDownStatus(override, args.coverageByUnitId);
      const affectedUnitId = override.oldUnitId ?? override.newUnitId;

      return {
        id: override.id,
        employeeName: `${override.employeeFirstName} ${override.employeeLastName}`,
        templateKey: parsed.templateKey,
        templateLabel: parsed.templateLabel,
        reason: parsed.displayReason,
        reasonDetails: parsed.details,
        oldUnitId: override.oldUnitId,
        oldUnitName: override.oldUnitName,
        newUnitId: override.newUnitId,
        newUnitName: override.newUnitName,
        mealType: override.mealType,
        status,
        statusLabel: resolveCallDownStatusLabel(status),
        changedAt: override.changedAt,
        staffingHref: buildStaffingHref(args.dateIso, affectedUnitId),
        coverageHref: "/today/coverage",
      };
    })
    .filter((item): item is CallDownItem => item !== null)
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "open" ? -1 : 1;
      }
      return b.changedAt.getTime() - a.changedAt.getTime();
    });
}

export function summarizeCallDowns(items: CallDownItem[]): CallDownSummary {
  let open = 0;
  let covered = 0;
  for (const item of items) {
    if (item.status === "open") open += 1;
    else covered += 1;
  }
  return { total: items.length, open, covered };
}

import type {
  OperationalEvidenceFieldType,
  OperationalTemplateApplicabilityKind,
  OperationalTemplatePurposeType,
  OperationalTemplateScheduleKind,
  SpaceType,
} from "@prisma/client";

import { parseLocalTime } from "@/lib/operational-cycles/cycle-windows";

import type {
  TemplateApplicabilityDraftInput,
  TemplateDraftInput,
  TemplateFieldDraftInput,
  TemplateScheduleDraftInput,
  TemplateValidationIssue,
  TemplateValidationResult,
} from "./types";

const FIELD_TYPES: ReadonlySet<string> = new Set<OperationalEvidenceFieldType>([
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "TEMPERATURE",
  "YES_NO",
  "PASS_NEEDS_ATTENTION",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "DATE",
  "TIME",
  "ATTESTATION",
  "OPTIONAL_COMMENT",
]);

const APPLICABILITY_KINDS: ReadonlySet<string> = new Set<OperationalTemplateApplicabilityKind>([
  "SPECIFIC_ASSET",
  "ASSET_TYPE",
  "SPECIFIC_SPACE",
  "SPACE_TYPE",
  "DEPARTMENT_UNIT",
]);

const SCHEDULE_KINDS: ReadonlySet<string> = new Set<OperationalTemplateScheduleKind>([
  "OPERATIONAL_CYCLE",
  "FIXED_DAILY_WINDOW",
  "ONCE_PER_OPERATIONAL_DATE",
  "AD_HOC",
]);

const PURPOSE_TYPES: ReadonlySet<string> = new Set<OperationalTemplatePurposeType>([
  "LOG",
  "CHECKLIST",
  "INSPECTION",
]);

const SPACE_TYPES: ReadonlySet<string> = new Set<SpaceType>([
  "SERVICE_AREA",
  "PATIENT_ROOM",
  "PRODUCTION_AREA",
  "STORAGE",
  "UTILITY",
  "OFFICE",
  "RESTROOM",
  "MECHANICAL",
  "PUBLIC_AREA",
  "OTHER",
]);

const SELECT_FIELD_TYPES: ReadonlySet<OperationalEvidenceFieldType> = new Set([
  "SINGLE_SELECT",
  "MULTI_SELECT",
]);

const RANGE_FIELD_TYPES: ReadonlySet<OperationalEvidenceFieldType> = new Set([
  "NUMBER",
  "TEMPERATURE",
]);

function issue(
  code: string,
  message: string,
  severity: "error" | "warning",
): TemplateValidationIssue {
  return { code, message, severity };
}

export function validateTemplateField(
  field: TemplateFieldDraftInput,
  index: number,
): TemplateValidationIssue[] {
  const errors: TemplateValidationIssue[] = [];
  const prefix = `fields[${index}]`;

  if (!field.label?.trim()) {
    errors.push(issue(`${prefix}.label_required`, "Field label is required.", "error"));
  }

  if (!FIELD_TYPES.has(field.fieldType)) {
    errors.push(issue(`${prefix}.field_type_invalid`, "Field type is not supported.", "error"));
  }

  if (!Number.isInteger(field.displaySequence)) {
    errors.push(
      issue(`${prefix}.display_sequence_invalid`, "Display sequence must be an integer.", "error"),
    );
  }

  if (RANGE_FIELD_TYPES.has(field.fieldType)) {
    if (
      field.minNumber != null &&
      field.maxNumber != null &&
      Number(field.minNumber) > Number(field.maxNumber)
    ) {
      errors.push(
        issue(
          `${prefix}.min_max_order`,
          "Minimum must be less than or equal to maximum.",
          "error",
        ),
      );
    }
  } else if (field.minNumber != null || field.maxNumber != null) {
    errors.push(
      issue(
        `${prefix}.range_not_applicable`,
        "Min/max apply only to NUMBER and TEMPERATURE fields.",
        "error",
      ),
    );
  }

  if (SELECT_FIELD_TYPES.has(field.fieldType)) {
    if (!field.allowedSelections || field.allowedSelections.length === 0) {
      errors.push(
        issue(
          `${prefix}.selections_required`,
          "Selection fields require at least one allowed selection.",
          "error",
        ),
      );
    }
  }

  if (field.correctiveActionRequired && !field.correctiveActionTrigger) {
    errors.push(
      issue(
        `${prefix}.corrective_required_without_trigger`,
        "Corrective action required implies corrective action trigger.",
        "error",
      ),
    );
  }

  if (field.fieldType === "OPTIONAL_COMMENT" && field.isRequired === true) {
    errors.push(
      issue(
        `${prefix}.optional_comment_required`,
        "OPTIONAL_COMMENT fields cannot be required.",
        "error",
      ),
    );
  }

  return errors;
}

export function validateTemplateApplicability(
  row: TemplateApplicabilityDraftInput,
  index: number,
): TemplateValidationIssue[] {
  const errors: TemplateValidationIssue[] = [];
  const prefix = `applicabilities[${index}]`;

  if (!APPLICABILITY_KINDS.has(row.kind)) {
    errors.push(issue(`${prefix}.kind_invalid`, "Applicability kind is not supported.", "error"));
    return errors;
  }

  switch (row.kind) {
    case "SPECIFIC_ASSET":
      if (!row.assetId?.trim()) {
        errors.push(issue(`${prefix}.asset_required`, "Specific asset requires assetId.", "error"));
      }
      break;
    case "ASSET_TYPE":
      if (!row.assetType?.trim()) {
        errors.push(
          issue(`${prefix}.asset_type_required`, "Asset type applicability requires assetType.", "error"),
        );
      }
      break;
    case "SPECIFIC_SPACE":
      if (!row.spaceId?.trim()) {
        errors.push(issue(`${prefix}.space_required`, "Specific space requires spaceId.", "error"));
      }
      break;
    case "SPACE_TYPE":
      if (!row.spaceType || !SPACE_TYPES.has(row.spaceType)) {
        errors.push(
          issue(`${prefix}.space_type_required`, "Space type applicability requires spaceType.", "error"),
        );
      }
      break;
    case "DEPARTMENT_UNIT":
      if (!row.unitId?.trim()) {
        errors.push(
          issue(`${prefix}.unit_required`, "Department unit applicability requires unitId.", "error"),
        );
      }
      break;
  }

  return errors;
}

export function validateTemplateSchedule(
  row: TemplateScheduleDraftInput,
  index: number,
): TemplateValidationIssue[] {
  const errors: TemplateValidationIssue[] = [];
  const prefix = `schedules[${index}]`;

  if (!SCHEDULE_KINDS.has(row.kind)) {
    errors.push(issue(`${prefix}.kind_invalid`, "Schedule kind is not supported.", "error"));
    return errors;
  }

  if (row.kind === "OPERATIONAL_CYCLE") {
    if (!row.cycleStableKey?.trim()) {
      errors.push(
        issue(
          `${prefix}.cycle_required`,
          "Operational cycle schedule requires cycleStableKey.",
          "error",
        ),
      );
    }
  }

  if (row.kind === "FIXED_DAILY_WINDOW") {
    const start = parseLocalTime(row.windowStartLocal);
    const end = parseLocalTime(row.windowEndLocal);
    if (!start) {
      errors.push(
        issue(
          `${prefix}.window_start_required`,
          "Fixed daily window requires windowStartLocal as HH:mm.",
          "error",
        ),
      );
    }
    if (!end) {
      errors.push(
        issue(
          `${prefix}.window_end_required`,
          "Fixed daily window requires windowEndLocal as HH:mm.",
          "error",
        ),
      );
    }
    if (start && end) {
      const startMin = start.hours * 60 + start.minutes;
      const endMin = end.hours * 60 + end.minutes;
      if (endMin <= startMin) {
        errors.push(
          issue(
            `${prefix}.window_order`,
            "Window end must be after window start.",
            "error",
          ),
        );
      }
    }
  }

  return errors;
}

/**
 * Validate a template draft or publish payload.
 * Pure — no DB. Callers use errors/warnings only (no "Blocked" status).
 */
export function validateTemplate(
  input: TemplateDraftInput,
  options?: { forPublish?: boolean },
): TemplateValidationResult {
  const errors: TemplateValidationIssue[] = [];
  const warnings: TemplateValidationIssue[] = [];
  const forPublish = options?.forPublish === true;

  if (!input.name?.trim()) {
    errors.push(issue("name_required", "Template name is required.", "error"));
  }

  if (!PURPOSE_TYPES.has(input.purposeType)) {
    errors.push(issue("purpose_type_invalid", "Purpose type is not supported.", "error"));
  }

  if (!input.fields || input.fields.length === 0) {
    errors.push(issue("fields_required", "At least one field is required.", "error"));
  } else {
    const keys = new Set<string>();
    const sequences = new Set<number>();
    for (let i = 0; i < input.fields.length; i++) {
      const field = input.fields[i]!;
      errors.push(...validateTemplateField(field, i));
      const key = field.fieldKey?.trim() || `field_${i + 1}`;
      if (keys.has(key)) {
        errors.push(issue(`fields[${i}].field_key_duplicate`, `Duplicate field key "${key}".`, "error"));
      }
      keys.add(key);
      if (sequences.has(field.displaySequence)) {
        errors.push(
          issue(
            `fields[${i}].display_sequence_duplicate`,
            `Duplicate display sequence ${field.displaySequence}.`,
            "error",
          ),
        );
      }
      sequences.add(field.displaySequence);
    }
  }

  const applicabilities = input.applicabilities ?? [];
  for (let i = 0; i < applicabilities.length; i++) {
    errors.push(...validateTemplateApplicability(applicabilities[i]!, i));
  }

  const schedules = input.schedules ?? [];
  if (forPublish && schedules.length === 0 && !input.allowAdHoc) {
    errors.push(
      issue(
        "schedule_or_adhoc_required",
        "Publish requires at least one schedule or allowAdHoc.",
        "error",
      ),
    );
  }
  for (let i = 0; i < schedules.length; i++) {
    errors.push(...validateTemplateSchedule(schedules[i]!, i));
  }

  if (forPublish && applicabilities.length === 0) {
    warnings.push(
      issue(
        "applicability_empty",
        "No applicability rows — requirement will be department-scoped without Asset/Space/Unit.",
        "warning",
      ),
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateTemplateForPublish(input: TemplateDraftInput): TemplateValidationResult {
  return validateTemplate(input, { forPublish: true });
}

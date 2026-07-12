import type {
  InspectionDefinitionSnapshot,
  InspectionItemAnswerInput,
  InspectionValidationResult,
  ValidatedInspectionItemAnswer,
} from "@/lib/work/inspections/types";

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeAnswer(
  item: InspectionDefinitionSnapshot["items"][number],
  answer: InspectionItemAnswerInput,
): { ok: true; value: ValidatedInspectionItemAnswer } | { ok: false; message: string } {
  const notes = hasText(answer.notes) ? answer.notes!.trim() : null;
  const valueText = hasText(answer.valueText) ? answer.valueText!.trim() : null;
  const valueNumber =
    answer.valueNumber === undefined || answer.valueNumber === null
      ? null
      : answer.valueNumber;

  if (item.responseType === "PASS_FAIL" || item.responseType === "YES_NO") {
    if (answer.passed !== true && answer.passed !== false) {
      return {
        ok: false,
        message: `Item "${item.label}" requires a pass/fail or yes/no answer.`,
      };
    }
    return {
      ok: true,
      value: {
        definitionItemId: item.id,
        passed: answer.passed,
        valueText: null,
        valueNumber: null,
        notes,
        isRequired: item.isRequired,
        responseType: item.responseType,
        failureCreatesFollowUp: item.failureCreatesFollowUp,
        label: item.label,
      },
    };
  }

  if (item.responseType === "TEXT") {
    if (!valueText) {
      return {
        ok: false,
        message: `Item "${item.label}" requires a text answer.`,
      };
    }
    return {
      ok: true,
      value: {
        definitionItemId: item.id,
        passed: null,
        valueText,
        valueNumber: null,
        notes,
        isRequired: item.isRequired,
        responseType: item.responseType,
        failureCreatesFollowUp: item.failureCreatesFollowUp,
        label: item.label,
      },
    };
  }

  // NUMBER / TEMPERATURE
  if (valueNumber === null || Number.isNaN(valueNumber)) {
    return {
      ok: false,
      message: `Item "${item.label}" requires a numeric answer.`,
    };
  }

  return {
    ok: true,
    value: {
      definitionItemId: item.id,
      passed: null,
      valueText: null,
      valueNumber,
      notes,
      isRequired: item.isRequired,
      responseType: item.responseType,
      failureCreatesFollowUp: item.failureCreatesFollowUp,
      label: item.label,
    },
  };
}

/**
 * Validate inspection answers against an already-loaded definition snapshot.
 * Scope checks: facility match, optional unit affinity on the definition.
 */
export function validateInspectionSubmission(input: {
  definition: InspectionDefinitionSnapshot | null;
  facilityId: string;
  unitId?: string | null;
  answers: InspectionItemAnswerInput[];
}): InspectionValidationResult {
  const { definition, facilityId, unitId = null, answers } = input;

  if (!definition) {
    return {
      ok: false,
      code: "DEFINITION_NOT_FOUND",
      message: "Inspection definition was not found.",
    };
  }

  if (definition.facilityId !== facilityId) {
    return {
      ok: false,
      code: "FACILITY_MISMATCH",
      message: "Inspection definition does not belong to this facility.",
    };
  }

  if (!definition.isActive) {
    return {
      ok: false,
      code: "DEFINITION_INACTIVE",
      message: "Inspection definition is not active.",
    };
  }

  if (definition.unitId && unitId && definition.unitId !== unitId) {
    return {
      ok: false,
      code: "UNIT_SCOPE_MISMATCH",
      message: "Unit does not match the inspection definition scope.",
    };
  }

  if (definition.unitId && !unitId) {
    return {
      ok: false,
      code: "UNIT_REQUIRED",
      message: "This inspection requires a unit.",
    };
  }

  const itemsById = new Map(definition.items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const validated: ValidatedInspectionItemAnswer[] = [];

  for (const answer of answers) {
    if (seen.has(answer.definitionItemId)) {
      return {
        ok: false,
        code: "DUPLICATE_ANSWER",
        message: `Duplicate answer for item ${answer.definitionItemId}.`,
      };
    }
    seen.add(answer.definitionItemId);

    const item = itemsById.get(answer.definitionItemId);
    if (!item) {
      return {
        ok: false,
        code: "UNKNOWN_ITEM",
        message: `Item ${answer.definitionItemId} does not belong to this definition.`,
      };
    }

    const normalized = normalizeAnswer(item, answer);
    if (!normalized.ok) {
      return {
        ok: false,
        code: "INVALID_ANSWER",
        message: normalized.message,
      };
    }
    validated.push(normalized.value);
  }

  for (const item of definition.items) {
    if (!item.isRequired) continue;
    if (!seen.has(item.id)) {
      return {
        ok: false,
        code: "REQUIRED_ITEM_MISSING",
        message: `Required item "${item.label}" is missing.`,
      };
    }
  }

  return {
    ok: true,
    definition,
    answers: validated,
    resolvedUnitId: unitId ?? definition.unitId,
  };
}

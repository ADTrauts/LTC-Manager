import type {
  DeterminedInspectionResult,
  ValidatedInspectionItemAnswer,
} from "@/lib/work/inspections/types";

function isFailedBinaryAnswer(answer: ValidatedInspectionItemAnswer): boolean {
  return (
    (answer.responseType === "PASS_FAIL" || answer.responseType === "YES_NO") &&
    answer.passed === false
  );
}

function hasFindingNotes(answer: ValidatedInspectionItemAnswer): boolean {
  return typeof answer.notes === "string" && answer.notes.trim().length > 0;
}

/**
 * Overall inspection result:
 * - any failed required binary item → FAILED
 * - findings (optional fail or notes) without required failure → PASSED_WITH_FINDINGS
 * - otherwise → PASSED
 *
 * `failureCreatesFollowUp` is recorded for later follow-up Task generation; it does not
 * change overall result rules in this milestone.
 */
export function determineInspectionResult(
  answers: ValidatedInspectionItemAnswer[],
): DeterminedInspectionResult {
  const failedRequiredItemIds: string[] = [];
  const findingItemIds: string[] = [];

  for (const answer of answers) {
    const failed = isFailedBinaryAnswer(answer);
    const notesFinding = hasFindingNotes(answer);

    if (failed && answer.isRequired) {
      failedRequiredItemIds.push(answer.definitionItemId);
    }

    if ((failed && !answer.isRequired) || notesFinding) {
      findingItemIds.push(answer.definitionItemId);
    }
  }

  if (failedRequiredItemIds.length > 0) {
    return {
      result: "FAILED",
      failedRequiredItemIds,
      findingItemIds,
    };
  }

  if (findingItemIds.length > 0) {
    return {
      result: "PASSED_WITH_FINDINGS",
      failedRequiredItemIds,
      findingItemIds,
    };
  }

  return {
    result: "PASSED",
    failedRequiredItemIds,
    findingItemIds,
  };
}

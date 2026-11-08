import type { InspectionResult } from "@prisma/client";

/** Calm, operator-facing copy after a successful save. Result is the inspection outcome, not a save failure. */
export function inspectionResultOperatorCopy(result: InspectionResult): {
  title: string;
  body: string;
} {
  switch (result) {
    case "PASSED":
      return {
        title: "Passed",
        body: "Inspection completed. No issues were found.",
      };
    case "PASSED_WITH_FINDINGS":
      return {
        title: "Passed with findings",
        body: "Inspection completed with findings for supervisor review.",
      };
    case "FAILED":
      return {
        title: "Needs attention",
        body: "Inspection completed. One or more required checks need attention.",
      };
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

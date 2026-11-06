import type { SubmitInspectionInput, SubmitInspectionResult } from "@/lib/work/inspections/types";
import type { TaskSyncDeps } from "@/lib/work/run-guarded-task-sync";

/**
 * Inspection submissions are retired. A check is a Catalog Record.
 * Historical submissions stay in the database until the table drop.
 */
export async function submitInspection(
  _input: SubmitInspectionInput,
  _deps: TaskSyncDeps = {},
): Promise<SubmitInspectionResult> {
  return {
    ok: false,
    validation: {
      ok: false,
      code: "DEFINITION_NOT_FOUND",
      message: "Record this inspection as a Catalog Record.",
    },
  };
}

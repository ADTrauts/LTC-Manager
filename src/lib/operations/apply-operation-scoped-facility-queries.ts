import type { DashboardQueryResult } from "@/lib/operations-center/load-dashboard-queries";

import { scopeLogDueQueries } from "./scope-log-due-queries";
import { scopeStaffingQueries } from "./scope-staffing-queries";
import type { ResolvedActiveOperation } from "./types";

export function applyOperationScopedFacilityQueries(
  queries: DashboardQueryResult,
  activeOperation: Pick<ResolvedActiveOperation, "source" | "operationContext"> | null,
  options?: { engineEnabled?: boolean },
): DashboardQueryResult {
  const scopeOptions = {
    activeOperation,
    engineEnabled: options?.engineEnabled,
  };

  const scopedLogs = scopeLogDueQueries({
    assignments: queries.assignments,
    submissions: queries.submissionsToday,
    ...scopeOptions,
  });
  const scopedStaffing = scopeStaffingQueries({
    schedules: queries.scheduleEntriesToday,
    overrides: queries.overridesToday,
    ...scopeOptions,
  });

  return {
    ...queries,
    assignments: scopedLogs.assignments,
    submissionsToday: scopedLogs.submissions,
    scheduleEntriesToday: scopedStaffing.schedules,
    overridesToday: scopedStaffing.overrides,
  };
}

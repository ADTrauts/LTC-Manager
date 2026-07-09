import { isOperationEngineEnabled } from "@/lib/feature-flags";
import { getTodayWindow } from "@/lib/operations-center/get-today-window";

import { findActiveOperationInstance } from "./find-active-operation-instance";
import { mapOperationInstanceToActiveOperation } from "./map-operation-instance";
import { resolveHeuristicActiveOperation } from "./resolve-heuristic-active-operation";
import type { ActiveOperationInstanceRow, ResolveActiveOperationInput, ResolvedActiveOperation } from "./types";

export type ResolveActiveOperationDeps = {
  isEngineEnabled?: typeof isOperationEngineEnabled;
  findInstance?: (input: {
    facilityId: string;
    departmentId: string;
    serviceDate: Date;
    now: Date;
  }) => Promise<ActiveOperationInstanceRow | null>;
};

export async function resolveActiveOperation(
  input: ResolveActiveOperationInput,
  deps: ResolveActiveOperationDeps = {},
): Promise<ResolvedActiveOperation> {
  const now = input.now ?? new Date();
  const serviceDate = getTodayWindow(now).start;
  const heuristicFallback = () =>
    resolveHeuristicActiveOperation({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      now,
      heuristicHints: input.heuristicHints,
      unitHeuristicHints: input.unitHeuristicHints,
    });

  const engineEnabled = (deps.isEngineEnabled ?? isOperationEngineEnabled)();
  if (!engineEnabled) {
    return heuristicFallback();
  }

  const findInstance = deps.findInstance ?? findActiveOperationInstance;
  const instance = await findInstance({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    serviceDate,
    now,
  });

  if (!instance) {
    return heuristicFallback();
  }

  return mapOperationInstanceToActiveOperation(instance, now);
}

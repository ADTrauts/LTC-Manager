/**
 * Supervisor Operations Board orchestrator (Phase 6O / 6P).
 * Authority + flag gate → fact loader → pure composer.
 * Visible Board consumes SupervisorOperationsViewModel.
 * presentSupervisorOperationsBoard remains for 6O compatibility tests.
 *
 * Canonical evidence still uses isCanonicalLogsEnabled + loadRuntimeLocationStates
 * + presentSupervisorEvidenceAttention (Phase 6N).
 */

import type { AppJwtPayload } from "@/lib/auth";
import { isDepartmentJobFlowEnabled } from "@/lib/department-operations";
import { prisma } from "@/lib/prisma";

import { resolveJobFlowAuthority, requireSupervisorBoard } from "./job-flow-authority";
import { composeSupervisorOperations } from "./supervisor-operations/compose";
import { loadSupervisorOperationsFacts } from "./supervisor-operations/load-facts";
import { presentSupervisorOperationsBoard } from "./supervisor-operations/present";
import type { SupervisorOperationsViewModel } from "./supervisor-operations/types";
import type { SupervisorOperationsBoard } from "./types";

export type LoadSupervisorOperationsBoardInput = {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  now?: Date;
  /** Phase 11C EVS location filters (query params). */
  filters?: {
    floor?: string | null;
    unit?: string | null;
    zone?: string | null;
    employee?: string | null;
  };
};

/**
 * Load the Supervisor Operations ViewModel (department-keyed flags — Phase 11B).
 * Returns null when flag is off; throws when authority is denied.
 */
export async function loadSupervisorOperationsViewModel(
  input: LoadSupervisorOperationsBoardInput,
): Promise<SupervisorOperationsViewModel | null> {
  const departmentRow = await prisma.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
    select: { id: true, name: true, key: true },
  });
  if (!departmentRow || !isDepartmentJobFlowEnabled(departmentRow.key)) {
    return null;
  }

  const authority = await resolveJobFlowAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  requireSupervisorBoard(authority);

  const facts = await loadSupervisorOperationsFacts({
    session: input.session,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    departmentKey: departmentRow.key,
    departmentName: departmentRow.name,
    now: input.now,
    filters: input.filters,
  });
  return composeSupervisorOperations(facts);
}

/**
 * Compatibility Board shape for 6O tests. Visible IA uses the ViewModel.
 */
export async function loadSupervisorOperationsBoard(
  input: LoadSupervisorOperationsBoardInput,
): Promise<SupervisorOperationsBoard | null> {
  const view = await loadSupervisorOperationsViewModel(input);
  return view ? presentSupervisorOperationsBoard(view) : null;
}

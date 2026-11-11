import { CanonicalSpacePanel } from "@/components/offline/canonical-space-panel";
/**
 * Phase 6K — Employee / Quick PIN execution on existing Neighborhood and SPACE routes.
 * Supervisors and managers never enter this path.
 */

import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { ReportProblemForm } from "@/components/operational-requests/report-problem-form";
import { EvidenceEntryForm } from "@/components/operational-evidence/evidence-entry-form";
import { EmployeeRuntimeExperience } from "@/components/unit-workspace/employee-runtime-experience";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import type { FacilitySession } from "@/lib/auth";
import { actorRefForSession } from "@/lib/offline/resolve-milestone-actor";
import { DEVICE_FACILITY_COOKIE, DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import {
  isDepartmentJobFlowEnabled,
  resolveUnitOperationalDepartment,
} from "@/lib/department-operations";
import {
  loadEmployeeRuntimeFlow,
  presentEmployeeRuntimeExperience,
} from "@/lib/employee-runtime-flow";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";
import { resolveSpaceWorkspaceViewer } from "@/lib/unit-workspace/space";
import { renderServeryActionChrome } from "./servery-action-chrome";
import { assignmentLifecycleAction } from "../../staffing/assignments/actions";

function firstSearchValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export async function tryRenderEmployeeRuntimeExperience(input: {
  session: FacilitySession;
  unitId: string;
  spaceId?: string | null;
  query?: {
    evidence?: string | string[];
    reportAsset?: string | string[];
    reportProblem?: string | string[];
  };
}): Promise<ReactNode | null> {
  const viewer = resolveSpaceWorkspaceViewer(input.session);
  if (viewer.kind !== "employee") return null;

  const cookieJar = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(input.session, cookieJar);
  const department = await resolveUnitOperationalDepartment({
    facilityId: input.session.facilityId,
    activeDepartmentId: deptNav.activeDepartmentId,
    unitId: input.unitId,
    feature: "jobFlow",
  });
  if (!department || !isDepartmentJobFlowEnabled(department.key)) {
    return null;
  }

  const employeeId = await getOperationalEmployeeIdForSession(input.session);
  if (!employeeId) return null;

  const deviceBoundUnitId = cookieJar.get(DEVICE_UNIT_COOKIE)?.value?.trim() || null;
  const loaded = await loadEmployeeRuntimeFlow({
    session: input.session,
    facilityId: input.session.facilityId,
    departmentId: department.id,
    employeeId,
    unitId: input.unitId,
    deviceBoundUnitId,
  });
  if (!loaded) return null;

  const view = presentEmployeeRuntimeExperience({
    flow: loaded.flow,
    grain: input.spaceId ? "space" : "neighborhood",
    landingUnitId: input.unitId,
    spaceId: input.spaceId ?? null,
    timezone: loaded.timezone,
    plantMessages: loaded.plantAttention.map((row) => row.message),
  });

  const evidenceKey = firstSearchValue(input.query?.evidence);
  const reportAsset = firstSearchValue(input.query?.reportAsset);
  const reportProblem = firstSearchValue(input.query?.reportProblem);
  const extras: ReactNode[] = [];
  if (loaded.completedAssignments.length) extras.push(<section key="completed-assignments" className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="employee-completed-assignments">
    <h2 className="font-semibold">Completed today</h2>
    <ul className="mt-2 space-y-3">{loaded.completedAssignments.map(row => <li key={row.id}>
      <p className="text-sm font-medium">{row.roleLabel} · {row.locationLabels?.join(", ") || row.unitName}</p>
      {row.notes ? <p className="whitespace-pre-wrap text-sm text-zinc-600">{row.notes}</p> : null}
    </li>)}</ul>
  </section>);
  const currentAssignment = loaded.flow.currentAssignment;
  if (view.showExecution && currentAssignment) {
    extras.push(<section key="assignment-completion" className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="employee-assignment-completion">
      <h2 className="font-semibold">Your Assignment</h2>
      {currentAssignment.notes ? <p className="mt-2 whitespace-pre-wrap text-sm">{currentAssignment.notes}</p> : null}
      <p className="mt-2 text-sm text-zinc-600">Complete this Assignment after finishing all its assigned locations. Completion ends its staffing Coverage.</p>
      <form action={assignmentLifecycleAction} className="mt-3 space-y-2">
        <input type="hidden" name="assignmentId" value={currentAssignment.id} />
        <input type="hidden" name="action" value="complete" />
        <input type="hidden" name="expectedUpdatedAt" value={currentAssignment.updatedAt?.toISOString() ?? ""} />
        <input name="changeReason" aria-label="Completion note" placeholder="Completion note (optional)" maxLength={500} className="w-full rounded-md border border-zinc-300 p-2 text-sm" />
        <button type="submit" className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white">Complete Assignment</button>
      </form>
    </section>);
  }
  const spaceId = input.spaceId;
  const canReviewCompleted = spaceId && deviceBoundUnitId === input.unitId &&
    cookieJar.get(DEVICE_FACILITY_COOKIE)?.value === input.session.facilityId &&
    loaded.completedAssignments.some(row => row.scopeKind === "SPACES"
      ? row.spaceIds.includes(spaceId)
      : row.unitId === input.unitId);
  if (spaceId && (view.showExecution || canReviewCompleted)) {
    extras.push(<CanonicalSpacePanel
      key={view.showExecution ? "space-offline" : "space-offline-review"}
      scope={{ facilityId: input.session.facilityId, departmentId: department.id, unitId: input.unitId, spaceId }}
      session={input.session}
      canPrepare={view.showExecution}
    />);
  }

  if (
    view.showExecution &&
    loaded.flow.evidenceMode === "template" &&
    evidenceKey &&
    department
  ) {
    const requirement = loaded.flow.templateEvidence.find((row) => row.requirementKey === evidenceKey);
    if (requirement) {
      extras.push(
        <EvidenceEntryForm
          key="employee-template-evidence"
          facilityId={input.session.facilityId}
          departmentId={department.id}
          unitId={input.unitId}
          requirement={requirement}
          deviceFacilityId={cookieJar.get(DEVICE_FACILITY_COOKIE)?.value?.trim() || null}
          deviceBoundUnitId={deviceBoundUnitId}
          actorRef={actorRefForSession(input.session)}
          sessionVersion={input.session.sessionVersion ?? 0}
        />,
      );
    }
  }

  if (
    view.showExecution &&
    input.spaceId &&
    view.milestones.some((row) => row.kind === "SERVERY_READY" || row.kind === "MEAL_SERVICE_STARTED")
  ) {
    extras.push(
      <div key="employee-servery">
        {await renderServeryActionChrome({
          session: input.session,
          unitId: input.unitId,
          timezone: loaded.timezone,
          now: loaded.now,
        })}
      </div>,
    );
  }

  if (view.showExecution && (reportAsset || reportProblem)) {
    extras.push(
      <ReportProblemForm
        key="employee-report"
        facilityId={input.session.facilityId}
        requestingDepartmentId={department.id}
        unitId={input.unitId}
        spaceId={input.spaceId ?? null}
        defaultAssetId={reportAsset && reportAsset !== "1" ? reportAsset : null}
        assets={[]}
        compact
      />,
    );
  }

  return (
    <EmployeeRuntimeExperience
      view={view}
      extras={extras.length > 0 ? <div className="space-y-3">{extras}</div> : null}
    />
  );
}

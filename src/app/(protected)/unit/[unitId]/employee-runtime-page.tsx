import { CanonicalSpacePanel } from "@/components/offline/canonical-space-panel";
/**
 * Phase 6K — Employee / Quick PIN execution on existing Neighborhood and SPACE routes.
 * Supervisors and managers never enter this path.
 */

import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { ReportProblemForm } from "@/components/operational-requests/report-problem-form";
import { WorkCompletionPanel } from "@/components/department-work/work-completion-panel";
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

function linkedRecordHref(
  flow: {
    evidenceMode: string;
    evidence: Array<{
      catalogStableKey: string | null;
      attachmentId: string;
      requirementKey: string;
    }>;
  },
  unitId: string,
  requirement: { completionMode: string; linkedTemplateStableKey: string | null },
): string | null {
  const key = requirement.linkedTemplateStableKey?.trim();
  if (!key || requirement.completionMode !== "LINKED_EVIDENCE") return null;
  if (flow.evidenceMode === "harbor") {
    const match = flow.evidence.find((item) => item.catalogStableKey === key);
    if (!match) return "/staffing/logs";
    const params = new URLSearchParams({
      attachmentId: match.attachmentId,
      requirementKey: match.requirementKey,
    });
    return `/staffing/logs/open?${params.toString()}`;
  }
  return `/unit/${unitId}?evidence=${encodeURIComponent(key)}`;
}

export async function tryRenderEmployeeRuntimeExperience(input: {
  session: FacilitySession;
  unitId: string;
  spaceId?: string | null;
  query?: {
    evidence?: string | string[];
    work?: string | string[];
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
    locationSequence: loaded.locationSequence,
    plantMessages: loaded.plantAttention.map((row) => row.message),
  });

  const evidenceKey = firstSearchValue(input.query?.evidence);
  const workKey = firstSearchValue(input.query?.work);
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
  if(view.showExecution && input.spaceId && department) extras.push(<CanonicalSpacePanel key="space-offline" scope={{facilityId:input.session.facilityId,departmentId:department.id,unitId:input.unitId,spaceId:input.spaceId}} session={input.session}/>);

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

  if (view.showExecution && workKey && department) {
    const requirement = loaded.flow.work.find((row) => row.occurrenceKey === workKey);
    if (requirement) {
      extras.push(
        <WorkCompletionPanel
          key="employee-work"
          facilityId={input.session.facilityId}
          departmentId={department.id}
          unitId={input.unitId}
          requirement={requirement}
          evidenceHref={linkedRecordHref(loaded.flow, input.unitId, requirement)}
          canonicalOffline={Boolean(input.spaceId)}
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

/**
 * Phase 6K — Employee / Quick PIN execution on existing Neighborhood and SPACE routes.
 * Supervisors and managers never enter this path.
 */

import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AssetIssueReportPanel } from "@/components/asset-operations/asset-issue-report-panel";
import { WorkCompletionPanel } from "@/components/department-work/work-completion-panel";
import { EvidenceEntryForm } from "@/components/operational-evidence/evidence-entry-form";
import { EmployeeRuntimeExperience } from "@/components/unit-workspace/employee-runtime-experience";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import type { AppJwtPayload } from "@/lib/auth";
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

function firstSearchValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export async function tryRenderEmployeeRuntimeExperience(input: {
  session: AppJwtPayload;
  unitId: string;
  spaceId?: string | null;
  query?: {
    evidence?: string | string[];
    work?: string | string[];
    reportAsset?: string | string[];
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
  const extras: ReactNode[] = [];

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

  if (view.showExecution && reportAsset) {
    extras.push(
      <AssetIssueReportPanel
        key="employee-report"
        facilityId={input.session.facilityId}
        departmentId={department.id}
        unitId={input.unitId}
        defaultAssetId={reportAsset !== "1" ? reportAsset : null}
        assets={loaded.flow.issues.map((issue) => ({
          id: issue.assetId,
          name: issue.summary,
          assetCode: "",
          statusLabel: issue.impact,
        }))}
        deviceFacilityId={cookieJar.get(DEVICE_FACILITY_COOKIE)?.value?.trim() || null}
        deviceBoundUnitId={deviceBoundUnitId}
        actorRef={actorRefForSession(input.session)}
        sessionVersion={input.session.sessionVersion ?? 0}
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

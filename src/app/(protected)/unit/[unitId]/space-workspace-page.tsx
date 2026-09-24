/**
 * Phase 6E — Canonical SPACE workspace.
 * Initial operational truth: one loadRuntimeLocationState call.
 * Neighborhood `/unit/[unitId]` without space is not loaded here.
 */

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AssetIssueReportPanel } from "@/components/asset-operations/asset-issue-report-panel";
import { SpaceWorkspaceView } from "@/components/unit-workspace/space-workspace-view";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { DEVICE_FACILITY_COOKIE, DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import { actorRefForSession } from "@/lib/offline/resolve-milestone-actor";
import {
  resolveRunPresentationDepartment,
  resolveSelectedRoomForUnit,
} from "@/lib/operational-cycles";
import { prisma } from "@/lib/prisma";
import { loadRuntimeLocationState } from "@/lib/runtime-location-state";
import {
  presentSpaceWorkspace,
  resolveSpaceWorkspaceViewer,
} from "@/lib/unit-workspace/space";
import { tryRenderEmployeeRuntimeExperience } from "./employee-runtime-page";
import { renderServeryActionChrome } from "./servery-action-chrome";

function firstSearchValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export async function SpaceWorkspacePage({
  session,
  unitId,
  spaceId,
  query,
}: {
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  unitId: string;
  spaceId: string;
  query?: {
    unitTab?: string | string[];
    evidence?: string | string[];
    work?: string | string[];
    reportAsset?: string | string[];
    mealServiceEvent?: string | string[];
  };
}) {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, facilityId: session.facilityId, isActive: true },
    select: { id: true, name: true, unitType: true },
  });
  if (!unit) notFound();

  const resolved = await resolveSelectedRoomForUnit({
    facilityId: session.facilityId,
    unitId: unit.id,
    spaceId,
  });
  if (!resolved.ok && resolved.reason === "not_found") notFound();
  if (!resolved.ok && resolved.reason === "wrong_unit") {
    const params = new URLSearchParams();
    params.set("space", spaceId);
    const unitTab = firstSearchValue(query?.unitTab);
    const evidence = firstSearchValue(query?.evidence);
    const work = firstSearchValue(query?.work);
    const reportAsset = firstSearchValue(query?.reportAsset);
    if (unitTab) params.set("unitTab", unitTab);
    if (evidence) params.set("evidence", evidence);
    if (work) params.set("work", work);
    if (reportAsset) params.set("reportAsset", reportAsset);
    redirect(`/unit/${resolved.identity.unitId}?${params.toString()}`);
  }

  const employeeRuntime = await tryRenderEmployeeRuntimeExperience({
    session,
    unitId: unit.id,
    spaceId,
    query,
  });
  if (employeeRuntime) {
    return employeeRuntime;
  }

  const cookieJar = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieJar);
  const department = await resolveRunPresentationDepartment({
    facilityId: session.facilityId,
    activeDepartmentId: deptNav.activeDepartmentId,
    unitId: unit.id,
  });
  if (!department) notFound();

  const loaded = await loadRuntimeLocationState({
    facilityId: session.facilityId,
    spaceRef: {
      spaceId,
      departmentId: department.id,
      departmentLabel: department.name,
      unitId: unit.id,
    },
  });
  if (!loaded) notFound();

  const viewer = resolveSpaceWorkspaceViewer(session);
  const view = presentSpaceWorkspace(loaded, {
    viewer,
    evidenceFocusKey: firstSearchValue(query?.evidence),
    unitTab: firstSearchValue(query?.unitTab),
    reportAsset: firstSearchValue(query?.reportAsset),
  });

  const reportAsset = firstSearchValue(query?.reportAsset);
  const extras = {
    assets: reportAsset
      ? (
          <AssetIssueReportPanel
            facilityId={session.facilityId}
            departmentId={department.id}
            unitId={unit.id}
            defaultAssetId={reportAsset !== "1" ? reportAsset : null}
            assets={loaded.assets.assets.map((asset) => ({
              id: asset.assetId,
              name: asset.name,
              assetCode: "",
              statusLabel: asset.status,
            }))}
            deviceFacilityId={cookieJar.get(DEVICE_FACILITY_COOKIE)?.value?.trim() || null}
            deviceBoundUnitId={cookieJar.get(DEVICE_UNIT_COOKIE)?.value?.trim() || null}
            actorRef={actorRefForSession(session)}
            sessionVersion={session.sessionVersion ?? 0}
            compact
          />
        )
      : null,
    milestones: view.milestones.showServeryControls
      ? await renderServeryActionChrome({
          session,
          unitId: unit.id,
          timezone: loaded.asOf.timezone,
          now: loaded.asOf.now,
        })
      : null,
  };

  return <SpaceWorkspaceView view={view} extras={extras} />;
}

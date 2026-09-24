/**
 * Phase 6F / 6R — Neighborhood workspace as child SPACE aggregation.
 * One loadRuntimeLocationStates batch. No Neighborhood RLS. No leftover fallthrough.
 */

import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { NeighborhoodWorkspaceView } from "@/components/unit-workspace/neighborhood-workspace-view";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { departmentAdminHref } from "@/lib/department-administration";
import { isProjectionLocationsEnabled } from "@/lib/feature-flags";
import { loadLocationsView } from "@/lib/locations";
import { prisma } from "@/lib/prisma";
import { loadRuntimeLocationStates } from "@/lib/runtime-location-state";
import {
  collectNeighborhoodActionableSpaces,
  isStructuralNeighborhoodUnit,
  presentNeighborhoodWorkspace,
} from "@/lib/unit-workspace/neighborhood";
import { resolveSpaceWorkspaceViewer } from "@/lib/unit-workspace/space";
import { tryRenderEmployeeRuntimeExperience } from "./employee-runtime-page";
import { UnitRouteUnavailable } from "./unit-route-unavailable";

function firstSearchValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

async function resolveEmptySpaceActions(input: {
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  unitId: string;
}): Promise<{
  facilityBuilderHref: string | null;
  departmentLocationsHref: string | null;
}> {
  const viewer = resolveSpaceWorkspaceViewer(input.session);
  if (viewer.kind === "employee") {
    return { facilityBuilderHref: null, departmentLocationsHref: null };
  }

  const physicalSpaceCount = await prisma.unitSpace.count({
    where: {
      unitId: input.unitId,
      facilityId: input.session.facilityId,
      isActive: true,
    },
  });

  if (physicalSpaceCount === 0) {
    return {
      facilityBuilderHref: hasAtLeastRole(input.session.role, "FACILITY_ADMINISTRATOR")
        ? "/admin/facility/builder"
        : null,
      departmentLocationsHref: null,
    };
  }

  if (!hasAtLeastRole(input.session.role, "MANAGER")) {
    return { facilityBuilderHref: null, departmentLocationsHref: null };
  }

  const primary = await prisma.unitDepartmentResponsibility.findFirst({
    where: { unitId: input.unitId, kind: "PRIMARY" },
    select: { departmentId: true },
  });
  let departmentId = primary?.departmentId ?? null;
  if (!departmentId) {
    const deptNav = await resolveActiveDepartmentForShell(input.session, await cookies());
    departmentId = deptNav.activeDepartmentId;
  }

  return {
    facilityBuilderHref: null,
    departmentLocationsHref: departmentId
      ? departmentAdminHref(departmentId, "locations")
      : "/admin/departments",
  };
}

export async function tryRenderNeighborhoodWorkspace(input: {
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  unitId: string;
  query?: {
    unitTab?: string | string[];
    evidence?: string | string[];
    work?: string | string[];
    reportAsset?: string | string[];
  };
}): Promise<ReactNode> {
  const unit = await prisma.unit.findFirst({
    where: {
      id: input.unitId,
      facilityId: input.session.facilityId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      hierarchyRole: true,
      childUnits: {
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      },
    },
  });
  if (!unit) notFound();

  if (isStructuralNeighborhoodUnit(unit.hierarchyRole)) {
    return (
      <UnitRouteUnavailable
        kind="structural"
        unitName={unit.name}
        hierarchyRole={unit.hierarchyRole === "BUILDING" ? "BUILDING" : "FLOOR"}
        links={unit.childUnits.map((child) => ({
          href: `/unit/${child.id}`,
          label: child.name,
        }))}
      />
    );
  }

  const employeeRuntime = await tryRenderEmployeeRuntimeExperience({
    session: input.session,
    unitId: unit.id,
    query: input.query,
  });
  if (employeeRuntime) {
    return employeeRuntime;
  }

  if (!isProjectionLocationsEnabled()) {
    return <UnitRouteUnavailable kind="projection_off" unitName={unit.name} />;
  }

  const locations = await loadLocationsView(input.session);
  if (!locations.view) {
    return <UnitRouteUnavailable kind="locations_unavailable" unitName={unit.name} />;
  }

  const collected = collectNeighborhoodActionableSpaces(locations.view, unit.id);
  const loaded =
    collected.refs.length === 0
      ? { states: [], stats: { perSpaceDomainLoads: 0 } }
      : await loadRuntimeLocationStates({
          facilityId: input.session.facilityId,
          spaceRefs: collected.refs,
        });

  const emptySpaceActions =
    collected.refs.length === 0
      ? await resolveEmptySpaceActions({ session: input.session, unitId: unit.id })
      : undefined;

  const view = presentNeighborhoodWorkspace(loaded.states, {
    unitId: unit.id,
    unitName: unit.name,
    viewer: resolveSpaceWorkspaceViewer(input.session),
    unitTab: firstSearchValue(input.query?.unitTab),
    emptySpaceActions,
  });

  return <NeighborhoodWorkspaceView view={view} />;
}

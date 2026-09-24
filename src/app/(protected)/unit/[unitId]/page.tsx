/**
 * Phase 6R — leaf Unit Workspace routing closure.
 * SPACE-first. No-space routes are Neighborhood, structural, or fail-closed.
 * Never loadUnitWorkspace. Never Wave 15H Experience workspace.
 */

import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { getSession } from "@/lib/auth";
import { tryRenderNeighborhoodWorkspace } from "./neighborhood-workspace-page";
import { SpaceWorkspacePage } from "./space-workspace-page";

type UnitDashboardPageProps = {
  params: Promise<{ unitId: string }>;
  searchParams?: Promise<{
    mealServiceEvent?: string | string[];
    unitTab?: string | string[];
    logTab?: string | string[];
    inspect?: string | string[];
    inspectionResult?: string | string[];
    inspectionName?: string | string[];
    followUpTask?: string | string[];
    occurrence?: string | string[];
    evidence?: string | string[];
    reportAsset?: string | string[];
    work?: string | string[];
    procedure?: string | string[];
    space?: string | string[];
  }>;
};

function firstSearchValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export default async function UnitDashboardPage({ params, searchParams }: UnitDashboardPageProps) {
  noStore();
  const { unitId } = await params;
  const query = searchParams ? await searchParams : undefined;

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const requestedSpaceId = firstSearchValue(query?.space);
  if (requestedSpaceId) {
    return (
      <SpaceWorkspacePage
        session={session}
        unitId={unitId}
        spaceId={requestedSpaceId}
        query={query}
      />
    );
  }

  return tryRenderNeighborhoodWorkspace({
    session,
    unitId,
    query,
  });
}

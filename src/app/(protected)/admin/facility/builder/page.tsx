import { SetupBuilderFrame } from "@/components/setup-builder-frame";
import { SetupWorkspaceLink } from "@/components/setup-workspace-link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { FacilityBuildContextBar } from "@/components/build/FacilityBuildContextBar";
import { SubNav } from "@/components/design-system/SubNav";
import { getSession } from "@/lib/auth";
import { requireAtLeastRole } from "@/lib/access";
import { loadFacilityHierarchy } from "@/lib/facility-builder/load-facility-hierarchy";
import { summarizeFacilityStructureCounts } from "@/lib/facility-builder/summarize-facility-structure-counts";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { FacilityBuilderClient } from "./facility-builder-client";
import { FacilityTerminologySettings } from "./facility-terminology-settings";
import { RoomTypesPanel } from "./room-types-panel";

type FacilityBuilderTab = "structure" | "room-types";

type FacilityBuilderPageProps = {
  searchParams?: Promise<{
    onboarding?: string | string[] | undefined;
    tab?: string | string[] | undefined;
  }>;
};

/** Structure is the primary Facility Builder surface; Room Types is the catalog. */
function resolveTab(raw: string | string[] | undefined): FacilityBuilderTab {
  const value = typeof raw === "string" ? raw : undefined;
  return value === "room-types" ? "room-types" : "structure";
}

function builderTabHref(tab: FacilityBuilderTab, setupWorkspace: boolean) {
  const params = new URLSearchParams();
  if (tab === "room-types") params.set("tab", "room-types");
  if (setupWorkspace) params.set("onboarding", "workspace");
  const query = params.toString();
  return query ? `/admin/facility/builder?${query}` : "/admin/facility/builder";
}

export default async function FacilityBuilderPage({ searchParams }: FacilityBuilderPageProps) {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  requireAtLeastRole(session.role, "MANAGER");

  const query = searchParams ? await searchParams : {};
  const setupWorkspace = query.onboarding === "workspace";
  const tab = resolveTab(query.tab);

  const hierarchy = await loadFacilityHierarchy(session.facilityId, session);
  const structureCounts = summarizeFacilityStructureCounts(hierarchy);

  return (
    <SetupBuilderFrame active={setupWorkspace}>
    <div className="mx-auto max-w-7xl space-y-3" data-testid="facility-builder-page">
      <SetupWorkspaceLink role={session.role} returned={setupWorkspace ? "building" : undefined} />

      <FacilityBuildContextBar
        facilityName={hierarchy.facilityName}
        vocabulary={hierarchy.vocabulary}
        counts={structureCounts}
        activeTab={tab}
        roomTypesTabHref={builderTabHref("room-types", setupWorkspace)}
        terminologyFooter={
          <FacilityTerminologySettings vocabulary={hierarchy.vocabulary} variant="compact" />
        }
      />

      <SubNav
        aria-label="Facility builder sections"
        data-testid="facility-builder-subnav"
        activeId={tab}
        items={[
          {
            id: "structure",
            label: "Structure",
            href: builderTabHref("structure", setupWorkspace),
          },
          {
            id: "room-types",
            label: "Room Types",
            href: builderTabHref("room-types", setupWorkspace),
          },
        ]}
      />

      {tab === "room-types" ? (
        <RoomTypesPanel roomTypes={hierarchy.roomTypes} />
      ) : (
        <FacilityBuilderClient
          hierarchy={hierarchy}
          canonicalLogsEnabled={isCanonicalLogsEnabled()}
        />
      )}
    </div>
    </SetupBuilderFrame>
  );
}

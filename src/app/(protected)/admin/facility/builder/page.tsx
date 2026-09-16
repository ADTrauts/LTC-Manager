import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
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

function builderTabHref(tab: FacilityBuilderTab, onboarding?: boolean) {
  const params = new URLSearchParams();
  if (tab === "room-types") params.set("tab", "room-types");
  if (onboarding) params.set("onboarding", "complete");
  const query = params.toString();
  return query ? `/admin/facility/builder?${query}` : "/admin/facility/builder";
}

export default async function FacilityBuilderPage({ searchParams }: FacilityBuilderPageProps) {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  requireAtLeastRole(session.role, "MANAGER");

  const query = searchParams ? await searchParams : {};
  const fromOnboarding =
    typeof query.onboarding === "string" && query.onboarding === "complete";
  const tab = resolveTab(query.tab);

  const hierarchy = await loadFacilityHierarchy(session.facilityId);
  const structureCounts = summarizeFacilityStructureCounts(hierarchy);

  return (
    <div className="mx-auto max-w-7xl space-y-3" data-testid="facility-builder-page">
      {fromOnboarding ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <h2 className="text-base font-semibold text-emerald-900">Setup complete — build your facility</h2>
          <p className="mt-1 text-sm text-emerald-800">
            Start with Structure to map floors and rooms. Define Room Types when you need shared
            classifications.{" "}
            <Link href="/build" className="font-medium underline">
              Open Build Home
            </Link>
          </p>
        </section>
      ) : null}

      <FacilityBuildContextBar
        facilityName={hierarchy.facilityName}
        vocabulary={hierarchy.vocabulary}
        counts={structureCounts}
        activeTab={tab}
        roomTypesTabHref={builderTabHref("room-types", fromOnboarding)}
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
            href: builderTabHref("structure", fromOnboarding),
          },
          {
            id: "room-types",
            label: "Room Types",
            href: builderTabHref("room-types", fromOnboarding),
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
  );
}

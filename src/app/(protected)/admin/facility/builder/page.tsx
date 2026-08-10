import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BuildPageHeader } from "@/components/build/build-breadcrumb";
import { getSession } from "@/lib/auth";
import { requireAtLeastRole } from "@/lib/access";
import { loadFacilityHierarchy } from "@/lib/facility-builder/load-facility-hierarchy";
import { buildBuilderCopy } from "@/lib/facility-builder/facility-vocabulary";
import { FacilityBuilderClient } from "./facility-builder-client";
import { FacilityTerminologySettings } from "./facility-terminology-settings";

type FacilityBuilderPageProps = {
  searchParams?: Promise<{
    onboarding?: string | string[] | undefined;
  }>;
};

export default async function FacilityBuilderPage({ searchParams }: FacilityBuilderPageProps) {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  requireAtLeastRole(session.role, "MANAGER");

  const query = searchParams ? await searchParams : {};
  const fromOnboarding =
    typeof query.onboarding === "string" && query.onboarding === "complete";

  const hierarchy = await loadFacilityHierarchy(session.facilityId);
  const copy = buildBuilderCopy(hierarchy.vocabulary);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {fromOnboarding ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="text-lg font-semibold text-emerald-900">Setup complete — build your facility</h2>
          <p className="mt-1 text-sm text-emerald-800">
            You&apos;re in Build mode. Start by mapping buildings, floors, and rooms here. You can refine departments,
            assets, and day-to-day Run surfaces after the structure is in place.
          </p>
          <p className="mt-2 text-sm text-emerald-800">
            Prefer the overview first?{" "}
            <Link href="/build" className="font-medium underline">
              Open Build Home
            </Link>
            .
          </p>
        </section>
      ) : null}
      <BuildPageHeader
        title="Facility Structure"
        breadcrumbCurrent="Facility Builder"
        subtitle={`${copy.page.subtitle} This page configures physical places only — it does not create logs, tasks, inspections, procedures, or operational workflows.`}
      />
      <FacilityTerminologySettings vocabulary={hierarchy.vocabulary} />
      <FacilityBuilderClient hierarchy={hierarchy} />
    </div>
  );
}

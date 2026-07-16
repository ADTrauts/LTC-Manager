import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { requireAtLeastRole } from "@/lib/access";
import { loadFacilityHierarchy } from "@/lib/facility-builder/load-facility-hierarchy";
import { buildBuilderCopy } from "@/lib/facility-builder/facility-vocabulary";
import { FacilityBuilderClient } from "./facility-builder-client";

export default async function FacilityBuilderPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  requireAtLeastRole(session.role, "MANAGER");

  const hierarchy = await loadFacilityHierarchy(session.facilityId);
  const copy = buildBuilderCopy(hierarchy.vocabulary);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header>
        <p className="text-sm text-zinc-500">
          <Link href="/admin" className="font-medium text-zinc-700 hover:text-zinc-900">
            Administration
          </Link>
          <span className="mx-1.5 text-zinc-400">/</span>
          <span className="text-zinc-600">Facility Builder</span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Facility Builder</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          {copy.page.subtitle}
        </p>
      </header>
      <FacilityBuilderClient hierarchy={hierarchy} />
    </div>
  );
}

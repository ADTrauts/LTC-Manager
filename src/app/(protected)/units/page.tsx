import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { UnitsManager } from "@/components/units-manager";
import { getSession } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/access";
import { loadUnitsPageData } from "@/lib/locations";

export default async function UnitsPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const canManageLogAssignments = hasAtLeastRole(session.role, "MANAGER");
  const data = await loadUnitsPageData(session, {
    includeTemplates: canManageLogAssignments,
  });

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Units</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Configure each location: type-specific details, sidebar order, and which compliance logs apply. Log
          templates are built under Logs; managers can attach them to a unit here or on the Logs → Assignments
          tab.
        </p>
        {data.projectionError ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            Location eligibility unavailable. Showing no locations (fail closed).
          </p>
        ) : null}
      </header>
      <UnitsManager
        units={data.units}
        parentOptions={data.parentOptions}
        templates={canManageLogAssignments ? data.templates : []}
        logAssignments={data.logAssignments}
        canManageLogAssignments={canManageLogAssignments}
      />
    </section>
  );
}

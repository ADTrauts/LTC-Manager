import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { getSession } from "@/lib/auth";
import { requireAtLeastRole } from "@/lib/access";
import { loadFacilityHierarchy } from "@/lib/facility-builder/load-facility-hierarchy";
import { buildBuilderCopy } from "@/lib/facility-builder/facility-vocabulary";
import { FacilityBuilderClient } from "./facility-builder-client";
import { FacilityTerminologySettings } from "./facility-terminology-settings";

export default async function FacilityBuilderPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  requireAtLeastRole(session.role, "MANAGER");

  const hierarchy = await loadFacilityHierarchy(session.facilityId);
  const copy = buildBuilderCopy(hierarchy.vocabulary);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <AdminPageHeader
        title="Facility Structure"
        trail={[{ label: "Facility Structure" }]}
        subtitle={`${copy.page.subtitle} This page configures physical places only — it does not create logs, tasks, inspections, procedures, or operational workflows.`}
      />
      <FacilityTerminologySettings vocabulary={hierarchy.vocabulary} />
      <FacilityBuilderClient hierarchy={hierarchy} />
    </div>
  );
}

import { redirect } from "next/navigation";

import { assertFacilityAdministratorPage } from "@/lib/facility-admin-guard";

/** Inspections admin is retired. Records are built in the Catalog. */
export default async function AdminInspectionsPage() {
  await assertFacilityAdministratorPage();
  redirect("/build/logs");
}

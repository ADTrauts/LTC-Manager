import { redirect } from "next/navigation";

import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";

/** Operational Templates are retired. Records are the Catalog. */
export default async function OperationalTemplateBuilderPage() {
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) redirect("/dashboard");
  redirect(hasAtLeastRole(session.role, "MANAGER") ? "/build/logs" : "/staffing/logs");
}

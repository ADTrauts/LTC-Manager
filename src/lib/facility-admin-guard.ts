import { redirect } from "next/navigation";

import { type AppRole, hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";

import { isFacilityAdministratorRole } from "@/lib/facility-admin";

export async function assertFacilityAdministratorPage(): Promise<
  Exclude<Awaited<ReturnType<typeof getSession>>, null>
> {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  if (!isFacilityAdministratorRole(session.role as AppRole)) {
    redirect("/dashboard");
  }
  return session;
}

export function assertFacilityAdministratorAction(role: AppRole): void {
  if (!hasAtLeastRole(role, "FACILITY_ADMINISTRATOR")) {
    throw new Error("Facility Administrator access required.");
  }
}

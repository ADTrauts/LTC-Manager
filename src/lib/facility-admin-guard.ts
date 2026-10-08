import { redirect } from "next/navigation";

import { type AppRole, hasAtLeastRole } from "@/lib/access";
import { getSession, type FacilitySession } from "@/lib/auth";

import { isFacilityAdministratorRole } from "@/lib/facility-admin";

export async function assertFacilityAdministratorPage(): Promise<FacilitySession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (!isFacilityAdministratorRole(session.role)) {
    redirect("/dashboard");
  }
  return session;
}

export function assertFacilityAdministratorAction(role: AppRole): void {
  if (!hasAtLeastRole(role, "FACILITY_ADMINISTRATOR")) {
    throw new Error("Facility Administrator access required.");
  }
}

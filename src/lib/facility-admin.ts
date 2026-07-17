import type { AppRole } from "@/lib/access";

/** Facility-wide admin hub (`/admin`): org, billing, permissions. */
export function isFacilityAdministratorRole(role: AppRole): boolean {
  return role === "FACILITY_ADMINISTRATOR";
}

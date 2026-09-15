import type { AppRole } from "@/lib/access";

/**
 * Minimal stub — full module lives on product/safety branches but is absent from main.
 * Enough for proxy/shell compile until the real module is restored.
 */
export function isFacilityAdministratorRole(role: AppRole): boolean {
  return (role as string) === "FACILITY_ADMINISTRATOR";
}

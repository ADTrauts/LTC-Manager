import type { FacilityDepartmentCatalogItem } from "@/lib/department-products/facility-catalog";

/** Derived commercial/install facts, separate from journey completion and configuration. */
export function onboardingCommercialStatus(input: {
  billingStatus: string | null;
  catalog: readonly Pick<FacilityDepartmentCatalogItem, "licensed" | "installed" | "operable">[];
}) {
  if (input.billingStatus === "INCOMPLETE") return "PAYMENT_PENDING";
  if (["CANCELED", "UNPAID", "PAUSED"].includes(input.billingStatus ?? "")) return "PAYMENT_REQUIRED";
  if (input.billingStatus === "PAST_DUE") return "PAYMENT_ATTENTION";
  if (input.catalog.some((item) => item.licensed && !item.installed)) return "INSTALLATION_PENDING";
  if (input.catalog.some((item) => item.operable)) return "ACCESS_AVAILABLE";
  return "NOT_LICENSED";
}

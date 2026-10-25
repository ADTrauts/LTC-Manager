import type { CatalogFormOwnerKind } from "@prisma/client";

import { LOG_PRESET_CATALOG_MATCHES } from "../../../prisma/apply-log-template-presets.mjs";

/**
 * The Catalog form a template already names, when the template key or a
 * shipped preset name is that form. Publication is checked by the caller.
 */
export function catalogStableKeyForTemplate(input: {
  stableKey: string;
  name: string;
}): string {
  const preset = LOG_PRESET_CATALOG_MATCHES.find((row) => row.preset === input.name);
  return preset?.catalogStableKey ?? input.stableKey;
}

/**
 * A work order or plan may require Vssyl's standard forms, plus forms owned
 * by the Department that runs it. A vendor-run Department uses that vendor's
 * forms. A self-operated Department uses the facility's forms.
 */
export function catalogFormServesRunningDepartment(input: {
  ownerKind: CatalogFormOwnerKind;
  ownerFacilityId: string | null;
  ownerOrganizationId: string | null;
  facilityId: string;
  contractedOrganizationId: string | null;
}): boolean {
  if (input.ownerKind === "VSSYL") return true;
  if (input.contractedOrganizationId) {
    return (
      input.ownerKind === "ORGANIZATION" &&
      input.ownerOrganizationId === input.contractedOrganizationId
    );
  }
  return input.ownerKind === "FACILITY" && input.ownerFacilityId === input.facilityId;
}

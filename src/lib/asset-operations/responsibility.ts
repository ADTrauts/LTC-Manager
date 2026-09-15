/**
 * Canonical Asset responsibility projection (BUILD facts).
 *
 * Three distinct concepts:
 * - Department user — LTC Manager department that uses the asset day to day
 * - Responsible maintainer — facility or operating partner obligated for maintenance/repair
 * - Preferred repair vendor — Vendor normally contacted for professional repair
 *
 * Manufacturer and physical location remain separate.
 *
 * Responsible maintainer options are FacilityOrganization rows: the facility itself
 * and any operating partners / subcontractors.
 * Platform Organization (tenancy) is not this list.
 */

import type { PrismaClient } from "@prisma/client";

export type AssetResponsibilityParty = {
  id: string;
  name: string;
  /** Optional contact lines for vendors; orgs may omit. */
  phone?: string | null;
  email?: string | null;
  contactName?: string | null;
  isActive?: boolean | null;
};

export type AssetResponsibilityProjection = {
  department: AssetResponsibilityParty | null;
  responsibleOrganization: AssetResponsibilityParty | null;
  preferredRepairProvider: AssetResponsibilityParty | null;
};

export function projectAssetResponsibility(input: {
  department?: { id: string; name: string } | null;
  responsibleOrganization?: {
    id: string;
    name: string;
    isActive?: boolean | null;
  } | null;
  preferredRepairProvider?: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    contactName?: string | null;
  } | null;
}): AssetResponsibilityProjection {
  return {
    department: input.department
      ? { id: input.department.id, name: input.department.name }
      : null,
    responsibleOrganization: input.responsibleOrganization
      ? {
          id: input.responsibleOrganization.id,
          name: input.responsibleOrganization.name,
          isActive: input.responsibleOrganization.isActive ?? true,
        }
      : null,
    preferredRepairProvider: input.preferredRepairProvider
      ? {
          id: input.preferredRepairProvider.id,
          name: input.preferredRepairProvider.name,
          phone: input.preferredRepairProvider.phone ?? null,
          email: input.preferredRepairProvider.email ?? null,
          contactName: input.preferredRepairProvider.contactName ?? null,
        }
      : null,
  };
}

export function departmentDisplayLabel(
  department: AssetResponsibilityParty | null | undefined,
): string {
  return department?.name?.trim() || "Not assigned";
}

export function responsibleOrganizationDisplayLabel(
  org: AssetResponsibilityParty | null | undefined,
): string {
  return org?.name?.trim() || "Not assigned";
}

export function preferredRepairProviderDisplayLabel(
  provider: AssetResponsibilityParty | null | undefined,
): string {
  return provider?.name?.trim() || "No preferred vendor";
}

/**
 * Names that should always be available as Responsible Organization options.
 * Facility display name first; optional legacy management-company partner when distinct.
 */
export function defaultResponsibleOrganizationNames(input: {
  facilityDisplayName: string;
  managementCompanyName?: string | null;
}): string[] {
  const names: string[] = [];
  const facility = input.facilityDisplayName.trim();
  if (facility) names.push(facility);

  const partner = input.managementCompanyName?.trim() || "";
  if (
    partner &&
    !names.some((n) => n.toLowerCase() === partner.toLowerCase())
  ) {
    names.push(partner);
  }
  return names;
}

type OrgListClient = Pick<PrismaClient, "facility" | "facilityOrganization">;

/**
 * Ensure the facility (and legacy management-company partner, if set) exist as
 * FacilityOrganization rows, then return active options for BUILD/RUN selectors.
 * Additional operating partners are added explicitly via FacilityOrganization create.
 */
export async function ensureAndListResponsibleOrganizations(
  client: OrgListClient,
  facilityId: string,
): Promise<Array<{ id: string; name: string }>> {
  const facility = await client.facility.findFirst({
    where: { id: facilityId },
    select: { displayName: true, managementCompanyName: true },
  });
  if (!facility) return [];

  const defaults = defaultResponsibleOrganizationNames({
    facilityDisplayName: facility.displayName,
    managementCompanyName: facility.managementCompanyName,
  });

  for (const name of defaults) {
    const existing = await client.facilityOrganization.findFirst({
      where: {
        facilityId,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (existing) continue;
    try {
      await client.facilityOrganization.create({
        data: {
          facilityId,
          name,
          isActive: true,
          notes:
            name.toLowerCase() === facility.displayName.trim().toLowerCase()
              ? "Facility (self)"
              : "Operating partner",
        },
      });
    } catch {
      // Concurrent create or unique race — list query below is authoritative.
    }
  }

  return client.facilityOrganization.findMany({
    where: { facilityId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Resolve vendor for a new Repair.
 * 1. Explicit Repair provider wins
 * 2. Else Asset preferred repair provider (vendorId)
 * 3. Else blank
 */
export function resolvePreferredRepairProviderForAsset(input: {
  existingRepairVendorId?: string | null;
  assetPreferredVendorId?: string | null;
}): string | null {
  const existing = input.existingRepairVendorId?.trim() || null;
  if (existing) return existing;
  const preferred = input.assetPreferredVendorId?.trim() || null;
  return preferred;
}

import type { OrganizationType } from "@prisma/client";

export const ORGANIZATION_TYPES = [
  "HEALTHCARE_SYSTEM",
  "MANAGEMENT_COMPANY",
  "LONG_TERM_CARE",
  "HOSPITAL",
  "K12_DISTRICT",
  "UNIVERSITY",
  "CORPORATE",
  "HOSPITALITY",
  "OTHER",
] as const;

export type OrganizationTypeValue = (typeof ORGANIZATION_TYPES)[number];

export const ORGANIZATION_TYPE_OPTIONS: ReadonlyArray<{
  value: OrganizationTypeValue;
  label: string;
}> = [
  { value: "HEALTHCARE_SYSTEM", label: "Healthcare system" },
  { value: "MANAGEMENT_COMPANY", label: "Management company" },
  { value: "LONG_TERM_CARE", label: "Long-term care" },
  { value: "HOSPITAL", label: "Hospital" },
  { value: "K12_DISTRICT", label: "K–12 district" },
  { value: "UNIVERSITY", label: "University" },
  { value: "CORPORATE", label: "Corporate" },
  { value: "HOSPITALITY", label: "Hospitality" },
  { value: "OTHER", label: "Other" },
];

export type OrganizationContext = {
  organizationId: string;
  organizationName: string;
  organizationLegalName: string | null;
  organizationDisplayName: string | null;
  organizationType: OrganizationType | null;
  facilityId: string;
  facilityName: string;
};

/** Normalize for deterministic grouping — trim + collapse space + lowercase key. */
export function normalizeOrganizationKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export function resolveOrganizationCreateName(input: {
  managementCompanyName?: string | null;
  facilityName: string;
}): { name: string; organizationType: OrganizationTypeValue } {
  const company = input.managementCompanyName?.trim();
  if (company) {
    return { name: company.replace(/\s+/g, " "), organizationType: "MANAGEMENT_COMPANY" };
  }
  const facility = input.facilityName.trim().replace(/\s+/g, " ") || "Facility";
  return { name: `${facility} Organization`, organizationType: "OTHER" };
}

export function isOrganizationType(value: string): value is OrganizationTypeValue {
  return (ORGANIZATION_TYPES as readonly string[]).includes(value);
}

export function organizationTypeLabel(value: OrganizationType | OrganizationTypeValue | null | undefined): string {
  if (!value) return "Unset";
  return ORGANIZATION_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

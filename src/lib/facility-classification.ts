import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Facility / Organization classification for Marketplace relevance.
 *
 * This is not commercial entitlement, Product release state, or installation.
 * Organization.organizationType and Facility.vocabularyProfile already store
 * the signals. This module projects them into a small Industry / Facility Type
 * taxonomy for Product applicability and future recommendations.
 *
 * Signup currently collects facility name and optional management company only.
 * The later collection points are Admin → Organization (organizationType) and
 * Facility Builder (vocabularyProfile). Do not invent a second persisted taxonomy.
 */

export const FACILITY_INDUSTRIES = ["HEALTHCARE", "OTHER"] as const;
export type FacilityIndustry = (typeof FACILITY_INDUSTRIES)[number];

export const FACILITY_TYPES = ["HOSPITAL", "LONG_TERM_CARE", "OTHER"] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

export type FacilityClassification = {
  industry: FacilityIndustry;
  facilityType: FacilityType;
};

const HEALTHCARE_ORGANIZATION_TYPES = new Set([
  "HEALTHCARE_SYSTEM",
  "LONG_TERM_CARE",
  "HOSPITAL",
]);

const ORGANIZATION_TYPE_TO_FACILITY_TYPE: Partial<Record<string, FacilityType>> = {
  HOSPITAL: "HOSPITAL",
  LONG_TERM_CARE: "LONG_TERM_CARE",
};

const VOCABULARY_TO_FACILITY_TYPE: Partial<Record<string, FacilityType>> = {
  ltc: "LONG_TERM_CARE",
  hospital: "HOSPITAL",
};

export function facilityIndustryLabel(industry: FacilityIndustry | string): string {
  if (industry === "HEALTHCARE" || industry === "healthcare") return "Healthcare";
  if (industry === "OTHER") return "Other";
  return industry;
}

export function facilityTypeLabel(facilityType: FacilityType | string): string {
  if (facilityType === "HOSPITAL") return "Hospital";
  if (facilityType === "LONG_TERM_CARE") return "Long-Term Care";
  if (facilityType === "OTHER") return "Other";
  return facilityType;
}

export function facilityTypeApplicabilityPhrase(facilityType: FacilityType): string {
  if (facilityType === "HOSPITAL") return "hospitals";
  if (facilityType === "LONG_TERM_CARE") return "long-term care";
  return "other facilities";
}

export function facilityTypeApplicabilitySummary(
  facilityTypes: readonly FacilityType[],
): string | null {
  const applicable = facilityTypes.filter((type) => type !== "OTHER");
  if (applicable.length === 0) return null;
  const phrases = applicable.map(facilityTypeApplicabilityPhrase);
  if (phrases.length === 1) return `For ${phrases[0]}.`;
  if (phrases.length === 2) return `For ${phrases[0]} and ${phrases[1]}.`;
  return `For ${phrases.slice(0, -1).join(", ")}, and ${phrases[phrases.length - 1]}.`;
}

/**
 * Project existing Organization / Facility signals into Industry + Facility Type.
 * Null vocabulary is not treated as Long-Term Care — that default is UI wording only.
 */
export function resolveFacilityClassification(input: {
  organizationType?: string | null;
  vocabularyProfile?: string | null;
}): FacilityClassification {
  const organizationType = input.organizationType?.trim() || null;
  const vocabularyProfile = input.vocabularyProfile?.trim() || null;

  const facilityType =
    (organizationType ? ORGANIZATION_TYPE_TO_FACILITY_TYPE[organizationType] : undefined) ??
    (vocabularyProfile ? VOCABULARY_TO_FACILITY_TYPE[vocabularyProfile] : undefined) ??
    "OTHER";

  const industry: FacilityIndustry =
    (organizationType && HEALTHCARE_ORGANIZATION_TYPES.has(organizationType)) ||
    facilityType === "HOSPITAL" ||
    facilityType === "LONG_TERM_CARE"
      ? "HEALTHCARE"
      : "OTHER";

  return { industry, facilityType };
}

export async function loadFacilityClassification(
  prisma: PrismaClient | Prisma.TransactionClient,
  facilityId: string,
): Promise<FacilityClassification> {
  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: {
      vocabularyProfile: true,
      organization: { select: { organizationType: true } },
    },
  });
  return resolveFacilityClassification({
    organizationType: facility?.organization?.organizationType ?? null,
    vocabularyProfile: facility?.vocabularyProfile ?? null,
  });
}

/**
 * Relevance only. Never grants Marketplace visibility, entitlement, or install.
 */
export function productAppliesToFacility(input: {
  productIndustry: FacilityIndustry | string;
  productFacilityTypes: readonly FacilityType[];
  facility: FacilityClassification;
}): boolean {
  if (input.productIndustry !== input.facility.industry) return false;
  if (input.productFacilityTypes.length === 0) return true;
  return input.productFacilityTypes.includes(input.facility.facilityType);
}

/**
 * Catalog browse / detail presentation for facility BUILD users (read-only).
 */

import type {
  CatalogLogCategory,
  CatalogLogPurposeType,
  CatalogRecommendedCadence,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import { isCanonicalLogsEnabled } from "@/lib/feature-flags";

import { catalogRecommendedScheduleLabel } from "./timing-display";
import { parseCatalogSuggestions, type CatalogSuggestions } from "./suggestions";

type Db = PrismaClient | Prisma.TransactionClient;

export function catalogCategoryLabel(category: CatalogLogCategory): string {
  switch (category) {
    case "TEMPERATURE":
      return "Temperature";
    case "SANITATION":
      return "Sanitation";
    case "CLEANING":
      return "Cleaning";
    case "EQUIPMENT":
      return "Equipment";
    case "FOOD_SAFETY":
      return "Food safety";
    case "OPENING_CLOSING":
      return "Opening / closing";
    case "COMPLIANCE":
      return "Compliance";
    case "OTHER":
      return "Other";
    default:
      return category;
  }
}

export function catalogPurposeLabel(purpose: CatalogLogPurposeType): string {
  switch (purpose) {
    case "LOG":
      return "Log";
    case "CHECKLIST":
      return "Checklist";
    default:
      return purpose;
  }
}

export type CatalogBrowseCard = {
  id: string;
  stableKey: string;
  version: number;
  name: string;
  description: string;
  category: CatalogLogCategory;
  categoryLabel: string;
  purposeType: CatalogLogPurposeType;
  purposeLabel: string;
  recommendedCadence: CatalogRecommendedCadence;
  recommendedCadenceLabel: string;
  fieldSummary: string;
  suggestedForLabels: string[];
  suggestions: CatalogSuggestions;
  maintainedByLtcCorp: true;
};

export type CatalogFieldPreview = {
  label: string;
  fieldType: string;
  helpText: string | null;
  rangeLabel: string | null;
  correctiveActionRequired: boolean;
};

export type CatalogDetailView = CatalogBrowseCard & {
  instructions: string;
  fields: CatalogFieldPreview[];
  correctiveActionSummary: string | null;
};

function suggestedForLabels(suggestions: CatalogSuggestions): string[] {
  const out: string[] = [];
  for (const t of suggestions.assetTypes) {
    out.push(humanizeToken(t));
  }
  for (const t of suggestions.spaceTypes) {
    out.push(humanizeToken(t));
  }
  return [...new Set(out)].slice(0, 6);
}

function humanizeToken(token: string): string {
  return token
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fieldRangeLabel(field: {
  minNumber: number | null;
  maxNumber: number | null;
  unitLabel: string | null;
}): string | null {
  if (field.minNumber == null && field.maxNumber == null) return null;
  const unit = field.unitLabel?.trim() ? field.unitLabel.trim() : "";
  if (field.minNumber != null && field.maxNumber != null) {
    return `${field.minNumber}${unit}–${field.maxNumber}${unit}`;
  }
  if (field.minNumber != null) return `≥ ${field.minNumber}${unit}`;
  return `≤ ${field.maxNumber}${unit}`;
}

function fieldSummaryFromFields(
  fields: ReadonlyArray<{ label: string; fieldType: string; unitLabel: string | null }>,
): string {
  const parts = fields
    .filter((f) => f.fieldType !== "OPTIONAL_COMMENT")
    .slice(0, 3)
    .map((f) => {
      if (f.fieldType === "TEMPERATURE") return f.unitLabel?.trim() ? `${f.label} (${f.unitLabel})` : f.label;
      if (f.fieldType === "NUMBER" && f.unitLabel?.trim()) return `${f.label} (${f.unitLabel.trim()})`;
      return f.label;
    });
  return parts.join(" · ");
}

function toBrowseCard(row: {
  id: string;
  stableKey: string;
  version: number;
  name: string;
  description: string | null;
  category: CatalogLogCategory;
  purposeType: CatalogLogPurposeType;
  recommendedCadence: CatalogRecommendedCadence | null;
  recommendedDaypartLabels?: string[];
  suggestionsJson: unknown;
  fields?: Array<{ label: string; fieldType: string; unitLabel: string | null }>;
}): CatalogBrowseCard {
  const suggestions = parseCatalogSuggestions(row.suggestionsJson);
  return {
    id: row.id,
    stableKey: row.stableKey,
    version: row.version,
    name: row.name,
    description: row.description ?? "",
    category: row.category,
    categoryLabel: catalogCategoryLabel(row.category),
    purposeType: row.purposeType,
    purposeLabel: catalogPurposeLabel(row.purposeType),
    recommendedCadence: row.recommendedCadence ?? "AD_HOC",
    recommendedCadenceLabel: catalogRecommendedScheduleLabel(
      row.recommendedCadence,
      row.recommendedDaypartLabels ?? [],
    ),
    fieldSummary: fieldSummaryFromFields(row.fields ?? []),
    suggestedForLabels: suggestedForLabels(suggestions),
    suggestions,
    maintainedByLtcCorp: true,
  };
}

/** Latest published Catalog definition per stableKey (drafts/retired excluded). */
export async function listPublishedCatalogBrowseCards(client: Db): Promise<CatalogBrowseCard[]> {
  if (!isCanonicalLogsEnabled()) return [];

  const rows = await client.catalogLogDefinition.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ category: "asc" }, { name: "asc" }, { version: "desc" }],
    select: {
      id: true,
      stableKey: true,
      version: true,
      name: true,
      description: true,
      category: true,
      purposeType: true,
      recommendedCadence: true,
      recommendedDaypartLabels: true,
      suggestionsJson: true,
      fields: {
        select: { label: true, fieldType: true, unitLabel: true, displaySequence: true },
        orderBy: { displaySequence: "asc" },
      },
    },
  });

  const seen = new Set<string>();
  const cards: CatalogBrowseCard[] = [];
  for (const row of rows) {
    if (seen.has(row.stableKey)) continue;
    seen.add(row.stableKey);
    cards.push(toBrowseCard(row));
  }
  return cards;
}

export async function loadPublishedCatalogDetail(
  client: Db,
  stableKey: string,
): Promise<CatalogDetailView | null> {
  if (!isCanonicalLogsEnabled()) return null;

  const row = await client.catalogLogDefinition.findFirst({
    where: { stableKey, status: "PUBLISHED" },
    orderBy: { version: "desc" },
    include: { fields: { orderBy: { displaySequence: "asc" } } },
  });
  if (!row) return null;

  const card = toBrowseCard(row);
  const fields: CatalogFieldPreview[] = row.fields.map((f) => ({
    label: f.label,
    fieldType: f.fieldType,
    helpText: f.helpText,
    rangeLabel: fieldRangeLabel(f),
    correctiveActionRequired: f.correctiveActionRequired,
  }));

  const hasCorrective = row.fields.some((f) => f.correctiveActionRequired || f.correctiveActionTrigger);
  return {
    ...card,
    instructions: row.instructions ?? "",
    fields,
    correctiveActionSummary: hasCorrective
      ? "Corrective action required for out-of-range readings"
      : null,
  };
}

export type CatalogBrowseFilterGroup =
  | "ALL"
  | "EQUIPMENT"
  | "FOOD_SAFETY"
  | "CLEANING_SANITATION"
  | "GENERAL_OPERATIONS";

export function catalogBrowseFilterGroupLabel(group: CatalogBrowseFilterGroup): string {
  switch (group) {
    case "ALL":
      return "All categories";
    case "EQUIPMENT":
      return "Equipment";
    case "FOOD_SAFETY":
      return "Food Safety";
    case "CLEANING_SANITATION":
      return "Cleaning / Sanitation";
    case "GENERAL_OPERATIONS":
      return "General Operations";
  }
}

export function categoryMatchesBrowseGroup(
  category: CatalogLogCategory,
  group: CatalogBrowseFilterGroup,
): boolean {
  if (group === "ALL") return true;
  if (group === "EQUIPMENT") return category === "EQUIPMENT";
  if (group === "FOOD_SAFETY") return category === "FOOD_SAFETY" || category === "TEMPERATURE";
  if (group === "CLEANING_SANITATION") return category === "CLEANING" || category === "SANITATION";
  return (
    category === "OPENING_CLOSING" || category === "COMPLIANCE" || category === "OTHER"
  );
}

export function filterCatalogCards(
  cards: readonly CatalogBrowseCard[],
  filters: {
    search?: string;
    category?: CatalogLogCategory | "ALL";
    browseGroup?: CatalogBrowseFilterGroup;
    purpose?: CatalogLogPurposeType | "ALL";
  },
): CatalogBrowseCard[] {
  const q = filters.search?.trim().toLowerCase() ?? "";
  return cards.filter((c) => {
    if (filters.browseGroup && !categoryMatchesBrowseGroup(c.category, filters.browseGroup)) {
      return false;
    }
    if (filters.category && filters.category !== "ALL" && c.category !== filters.category) {
      return false;
    }
    if (filters.purpose && filters.purpose !== "ALL" && c.purposeType !== filters.purpose) {
      return false;
    }
    if (!q) return true;
    const hay =
      `${c.name} ${c.description} ${c.categoryLabel} ${c.fieldSummary} ${c.suggestedForLabels.join(" ")}`.toLowerCase();
    return hay.includes(q);
  });
}

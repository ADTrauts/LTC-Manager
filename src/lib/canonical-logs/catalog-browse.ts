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

import { catalogCadenceLabel } from "./timing-display";
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

function toBrowseCard(row: {
  id: string;
  stableKey: string;
  version: number;
  name: string;
  description: string | null;
  category: CatalogLogCategory;
  purposeType: CatalogLogPurposeType;
  recommendedCadence: CatalogRecommendedCadence | null;
  suggestionsJson: unknown;
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
    recommendedCadenceLabel: catalogCadenceLabel(row.recommendedCadence),
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
      suggestionsJson: true,
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

export function filterCatalogCards(
  cards: readonly CatalogBrowseCard[],
  filters: {
    search?: string;
    category?: CatalogLogCategory | "ALL";
    purpose?: CatalogLogPurposeType | "ALL";
  },
): CatalogBrowseCard[] {
  const q = filters.search?.trim().toLowerCase() ?? "";
  return cards.filter((c) => {
    if (filters.category && filters.category !== "ALL" && c.category !== filters.category) {
      return false;
    }
    if (filters.purpose && filters.purpose !== "ALL" && c.purposeType !== filters.purpose) {
      return false;
    }
    if (!q) return true;
    const hay = `${c.name} ${c.description} ${c.categoryLabel} ${c.suggestedForLabels.join(" ")}`.toLowerCase();
    return hay.includes(q);
  });
}

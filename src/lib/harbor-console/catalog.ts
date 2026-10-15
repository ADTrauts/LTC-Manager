import type {
  CatalogLogCategory,
  CatalogLogPurposeType,
  CatalogRecommendedCadence,
  OperationalTemplateScheduleKind,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import {
  parseRecommendedFixedWindows,
  type CatalogRecommendedFixedWindow,
} from "@/lib/canonical-logs/catalog-authoring";
import {
  parseCatalogEvidenceRules,
  type CatalogEvidenceRule,
} from "@/lib/canonical-logs/evidence-rules";
import {
  parseInspectionSections,
  type InspectionSectionDefinition,
} from "@/lib/canonical-logs/inspection-score";
import {
  parseCalculations,
  parseRepeatingGroups,
  type CalculationDefinition,
  type RepeatingGroupDefinition,
} from "@/lib/canonical-logs/template-structure";
import { parseCatalogSuggestions, type CatalogSuggestions } from "@/lib/canonical-logs/suggestions";

import {
  catalogCategoryLabel,
  catalogPurposeLabel,
} from "@/lib/canonical-logs/catalog-browse";
import { listFacilityCatalogInstallCounts } from "@/lib/canonical-logs/facility-catalog-install";
import { catalogCadenceLabel } from "@/lib/canonical-logs/timing-display";
import {
  catalogLineStatusLabel,
  catalogStatusLabel,
} from "@/lib/harbor-console/catalog-presentation";

type Db = PrismaClient | Prisma.TransactionClient;

const versionSelect = {
  id: true,
  stableKey: true,
  version: true,
  status: true,
  name: true,
  description: true,
  instructions: true,
  purposeType: true,
  category: true,
  recommendedCadence: true,
  recommendedScheduleKind: true,
  recommendedDaypartLabels: true,
  recommendedFixedWindowsJson: true,
  suggestionsJson: true,
      rulesJson: true,
      passingScore: true,
      criticalFailureForcesFailure: true,
      sectionsJson: true,
      repeatingGroupsJson: true,
      calculationsJson: true,
      publishedAt: true,
  retiredAt: true,
  updatedAt: true,
  fields: {
    orderBy: { displaySequence: "asc" as const },
    select: {
      id: true,
      fieldKey: true,
      label: true,
      fieldType: true,
      isRequired: true,
      helpText: true,
      unitLabel: true,
      minNumber: true,
      maxNumber: true,
      allowedSelections: true,
      correctiveActionTrigger: true,
      correctiveActionRequired: true,
      sectionKey: true,
      scoreWeight: true,
      critical: true,
      creditValues: true,
    },
  },
} satisfies Prisma.CatalogLogDefinitionSelect;

export type HarborCatalogLine = {
  stableKey: string;
  name: string;
  categoryLabel: string;
  purposeLabel: string;
  statusLabel: string;
  latestVersion: number;
  installCount: number;
};

export type HarborCatalogField = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  helpText: string | null;
  unitLabel: string | null;
  minNumber: number | null;
  maxNumber: number | null;
  allowedSelections: string[];
  correctiveActionTrigger: boolean;
  correctiveActionRequired: boolean;
  sectionKey: string | null;
  scoreWeight: number | null;
  critical: boolean;
  creditValues: string[];
};

export type HarborCatalogVersion = {
  id: string;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  statusLabel: string;
  name: string;
  description: string;
  instructions: string;
  purposeType: CatalogLogPurposeType;
  purposeLabel: string;
  category: CatalogLogCategory;
  categoryLabel: string;
  cadenceLabel: string;
  recommendedCadence: CatalogRecommendedCadence | null;
  recommendedScheduleKind: OperationalTemplateScheduleKind | null;
  recommendedDaypartLabels: string[];
  recommendedFixedWindows: CatalogRecommendedFixedWindow[];
  suggestions: CatalogSuggestions;
  fields: HarborCatalogField[];
  rules: CatalogEvidenceRule[];
  passingScore: number | null;
  criticalFailureForcesFailure: boolean;
  sections: InspectionSectionDefinition[];
  repeatingGroups: RepeatingGroupDefinition[];
  calculations: CalculationDefinition[];
};

export type HarborCatalogDetail = {
  stableKey: string;
  name: string;
  statusLabel: string;
  draft: HarborCatalogVersion | null;
  published: HarborCatalogVersion | null;
  versions: Array<{
    id: string;
    version: number;
    statusLabel: string;
    status: "DRAFT" | "PUBLISHED" | "RETIRED";
  }>;
};

function toField(
  field: Prisma.CatalogLogFieldGetPayload<{ select: (typeof versionSelect)["fields"]["select"] }>,
): HarborCatalogField {
  return {
    id: field.id,
    fieldKey: field.fieldKey,
    label: field.label,
    fieldType: field.fieldType,
    isRequired: field.isRequired,
    helpText: field.helpText,
    unitLabel: field.unitLabel,
    minNumber: field.minNumber,
    maxNumber: field.maxNumber,
    allowedSelections: field.allowedSelections,
    correctiveActionTrigger: field.correctiveActionTrigger,
    correctiveActionRequired: field.correctiveActionRequired,
    sectionKey: field.sectionKey,
    scoreWeight: field.scoreWeight,
    critical: field.critical,
    creditValues: field.creditValues,
  };
}

function toVersion(
  row: Prisma.CatalogLogDefinitionGetPayload<{ select: typeof versionSelect }>,
): HarborCatalogVersion {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    statusLabel: catalogStatusLabel(row.status),
    name: row.name,
    description: row.description ?? "",
    instructions: row.instructions ?? "",
    purposeType: row.purposeType,
    purposeLabel: catalogPurposeLabel(row.purposeType),
    category: row.category,
    categoryLabel: catalogCategoryLabel(row.category),
    recommendedCadence: row.recommendedCadence,
    recommendedScheduleKind: row.recommendedScheduleKind,
    recommendedDaypartLabels: row.recommendedDaypartLabels,
    recommendedFixedWindows: parseRecommendedFixedWindows(row.recommendedFixedWindowsJson),
    suggestions: parseCatalogSuggestions(row.suggestionsJson),
    cadenceLabel: catalogCadenceLabel(row.recommendedCadence),
    fields: row.fields.map(toField),
    rules: parseCatalogEvidenceRules(row.rulesJson),
    passingScore: row.passingScore,
    criticalFailureForcesFailure: row.criticalFailureForcesFailure,
    sections: parseInspectionSections(row.sectionsJson),
    repeatingGroups: parseRepeatingGroups(row.repeatingGroupsJson),
    calculations: parseCalculations(row.calculationsJson),
  };
}

export async function listHarborCatalogLines(client: Db): Promise<HarborCatalogLine[]> {
  const [rows, installCounts] = await Promise.all([
    client.catalogLogDefinition.findMany({
      select: {
        stableKey: true,
        version: true,
        status: true,
        name: true,
        category: true,
        purposeType: true,
      },
      orderBy: [{ name: "asc" }, { version: "desc" }],
    }),
    listFacilityCatalogInstallCounts(client),
  ]);

  const byKey = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byKey.get(row.stableKey) ?? [];
    list.push(row);
    byKey.set(row.stableKey, list);
  }

  return [...byKey.entries()]
    .map(([stableKey, versions]) => {
      const headline = versions.find((row) => row.status === "PUBLISHED") ?? versions[0]!;
      return {
        stableKey,
        name: headline.name,
        categoryLabel: catalogCategoryLabel(headline.category),
        purposeLabel: catalogPurposeLabel(headline.purposeType),
        statusLabel: catalogLineStatusLabel(versions),
        latestVersion: Math.max(...versions.map((row) => row.version)),
        installCount: installCounts.get(stableKey) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadHarborCatalogDetail(
  client: Db,
  stableKey: string,
): Promise<HarborCatalogDetail | null> {
  const rows = await client.catalogLogDefinition.findMany({
    where: { stableKey },
    select: versionSelect,
    orderBy: { version: "desc" },
  });
  if (rows.length === 0) return null;

  const draftRow = rows.find((row) => row.status === "DRAFT") ?? null;
  const publishedRow = rows.find((row) => row.status === "PUBLISHED") ?? null;
  const headline = publishedRow ?? draftRow ?? rows[0]!;

  return {
    stableKey,
    name: headline.name,
    statusLabel: catalogLineStatusLabel(rows),
    draft: draftRow ? toVersion(draftRow) : null,
    published: publishedRow ? toVersion(publishedRow) : null,
    versions: rows.map((row) => ({
      id: row.id,
      version: row.version,
      status: row.status,
      statusLabel: catalogStatusLabel(row.status),
    })),
  };
}

/** Headline record adoption. Install rows are unique per facility and stable key. */
export async function loadHarborCatalogAdoption(
  client: Db,
  stableKey: string,
): Promise<{ facilityInstallCount: number; activePlacementCount: number }> {
  const [facilityInstallCount, activePlacementCount] = await Promise.all([
    client.facilityCatalogInstall.count({ where: { catalogStableKey: stableKey } }),
    client.logAttachment.count({ where: { catalogStableKey: stableKey, status: "ACTIVE" } }),
  ]);
  return { facilityInstallCount, activePlacementCount };
}

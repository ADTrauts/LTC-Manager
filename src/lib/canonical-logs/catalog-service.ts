import type {
  CatalogLogCategory,
  CatalogLogPurposeType,
  CatalogLogStatus,
  CatalogRecommendedCadence,
  OperationalEvidenceFieldType,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { randomBytes } from "node:crypto";

import { isCanonicalLogsEnabled } from "@/lib/feature-flags";

type Db = PrismaClient | Prisma.TransactionClient;

export type CatalogActor = {
  userId?: string | null;
};

export type CatalogWriteOptions = {
  /**
   * Facility BUILD mutations stay behind CANONICAL_LOGS_ENABLED.
   * Harbor Catalog is platform authoring and passes `false`.
   */
  requireFeatureFlag?: boolean;
};

export type CatalogFieldInput = {
  label: string;
  fieldType: OperationalEvidenceFieldType;
  isRequired?: boolean;
  helpText?: string | null;
  unitLabel?: string | null;
  minNumber?: number | null;
  maxNumber?: number | null;
  allowedSelections?: string[];
  correctiveActionTrigger?: boolean;
  correctiveActionRequired?: boolean;
};

export type CatalogDefinitionInput = {
  name: string;
  description?: string | null;
  instructions?: string | null;
  purposeType: CatalogLogPurposeType;
  category: CatalogLogCategory;
  recommendedCadence?: CatalogRecommendedCadence | null;
  fields: CatalogFieldInput[];
};

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function requireFlag() {
  if (!isCanonicalLogsEnabled()) {
    throw new Error("Canonical Logs are not enabled (CANONICAL_LOGS_ENABLED).");
  }
}

function maybeRequireFlag(options?: CatalogWriteOptions) {
  if (options?.requireFeatureFlag === false) return;
  requireFlag();
}

export function slugCatalogToken(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.slice(0, 64) || "untitled";
}

function uniqueFieldKeys(fields: readonly CatalogFieldInput[]): string[] {
  const used = new Set<string>();
  return fields.map((field, index) => {
    const base = slugCatalogToken(field.label) || `field_${index + 1}`;
    let key = base;
    let n = 2;
    while (used.has(key)) {
      key = `${base}_${n}`;
      n += 1;
    }
    used.add(key);
    return key;
  });
}

function fieldCreates(fields: readonly CatalogFieldInput[]) {
  const keys = uniqueFieldKeys(fields);
  return fields.map((field, index) => ({
    id: cuidLike(),
    fieldKey: keys[index]!,
    label: field.label.trim(),
    fieldType: field.fieldType,
    isRequired: field.isRequired !== false,
    displaySequence: (index + 1) * 10,
    helpText: field.helpText?.trim() || null,
    unitLabel: field.unitLabel?.trim() || null,
    minNumber: field.minNumber ?? null,
    maxNumber: field.maxNumber ?? null,
    allowedSelections: field.allowedSelections ?? [],
    correctiveActionTrigger: field.correctiveActionTrigger === true,
    correctiveActionRequired: field.correctiveActionRequired === true,
  }));
}

async function allocateStableKey(client: Db, name: string): Promise<string> {
  const base = slugCatalogToken(name);
  let key = base;
  let n = 2;
  while (await client.catalogLogDefinition.findFirst({ where: { stableKey: key }, select: { id: true } })) {
    key = `${base}_${n}`;
    n += 1;
  }
  return key;
}

export async function loadCatalogDefinitionById(client: Db, id: string) {
  return client.catalogLogDefinition.findUnique({
    where: { id },
    include: { fields: { orderBy: { displaySequence: "asc" } } },
  });
}

export async function loadPublishedCatalogByStableKey(client: Db, stableKey: string) {
  return client.catalogLogDefinition.findFirst({
    where: { stableKey, status: "PUBLISHED" },
    orderBy: { version: "desc" },
    include: { fields: { orderBy: { displaySequence: "asc" } } },
  });
}

export function assertCatalogPublishedImmutable(status: CatalogLogStatus) {
  if (status === "PUBLISHED") {
    throw new Error("Published Catalog definitions are immutable. Create a successor draft instead.");
  }
}

/**
 * Publish a DRAFT Catalog definition. Marks publishedAt.
 * Does not auto-retire prior published versions (Attachments pin version).
 */
export async function publishCatalogDefinition(
  client: Db,
  definitionId: string,
  _actor?: CatalogActor,
  options?: CatalogWriteOptions,
) {
  maybeRequireFlag(options);
  const row = await client.catalogLogDefinition.findUnique({
    where: { id: definitionId },
    include: { fields: true },
  });
  if (!row) throw new Error("Catalog definition not found.");
  if (row.status === "PUBLISHED") return row;
  if (row.status === "RETIRED") throw new Error("Cannot publish a retired Catalog definition.");
  if (row.fields.length === 0) throw new Error("Cannot publish a Catalog definition with no fields.");

  return client.catalogLogDefinition.update({
    where: { id: definitionId },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      retiredAt: null,
    },
    include: { fields: { orderBy: { displaySequence: "asc" } } },
  });
}

export async function retireCatalogDefinition(
  client: Db,
  definitionId: string,
  options?: CatalogWriteOptions,
) {
  maybeRequireFlag(options);
  const row = await client.catalogLogDefinition.findUnique({ where: { id: definitionId } });
  if (!row) throw new Error("Catalog definition not found.");
  if (row.status === "DRAFT") {
    throw new Error("Retire applies to published Catalog versions. Delete draft instead if unused.");
  }
  return client.catalogLogDefinition.update({
    where: { id: definitionId },
    data: { status: "RETIRED", retiredAt: new Date() },
    include: { fields: { orderBy: { displaySequence: "asc" } } },
  });
}

/**
 * Create a DRAFT successor from a published version (immutable publish preserved).
 */
export async function createCatalogDraftSuccessor(
  client: Db,
  fromDefinitionId: string,
  options?: CatalogWriteOptions,
) {
  maybeRequireFlag(options);
  const source = await client.catalogLogDefinition.findUnique({
    where: { id: fromDefinitionId },
    include: { fields: { orderBy: { displaySequence: "asc" } } },
  });
  if (!source) throw new Error("Catalog definition not found.");
  if (source.status !== "PUBLISHED" && source.status !== "RETIRED") {
    throw new Error("Successor drafts are created from published or retired versions.");
  }

  const existingDraft = await client.catalogLogDefinition.findFirst({
    where: { stableKey: source.stableKey, status: "DRAFT" },
    select: { id: true },
  });
  if (existingDraft) {
    throw new Error("A draft already exists for this Catalog Log.");
  }

  const maxVersion = await client.catalogLogDefinition.aggregate({
    where: { stableKey: source.stableKey },
    _max: { version: true },
  });
  const nextVersion = (maxVersion._max.version ?? source.version) + 1;

  return client.catalogLogDefinition.create({
    data: {
      id: cuidLike(),
      stableKey: source.stableKey,
      version: nextVersion,
      status: "DRAFT",
      name: source.name,
      description: source.description,
      instructions: source.instructions,
      purposeType: source.purposeType,
      category: source.category,
      recommendedCadence: source.recommendedCadence,
      recommendedScheduleKind: source.recommendedScheduleKind,
      recommendedDaypartLabels: source.recommendedDaypartLabels,
      recommendedFixedWindowsJson: source.recommendedFixedWindowsJson ?? undefined,
      suggestionsJson: source.suggestionsJson ?? {},
      fields: {
        create: source.fields.map((f) => ({
          id: cuidLike(),
          fieldKey: f.fieldKey,
          label: f.label,
          fieldType: f.fieldType,
          isRequired: f.isRequired,
          displaySequence: f.displaySequence,
          helpText: f.helpText,
          unitLabel: f.unitLabel,
          minNumber: f.minNumber,
          maxNumber: f.maxNumber,
          allowedSelections: f.allowedSelections,
          correctiveActionTrigger: f.correctiveActionTrigger,
          correctiveActionRequired: f.correctiveActionRequired,
        })),
      },
    },
    include: { fields: { orderBy: { displaySequence: "asc" } } },
  });
}

export async function createCatalogDefinition(
  client: Db,
  input: CatalogDefinitionInput,
  options?: CatalogWriteOptions,
) {
  maybeRequireFlag(options);
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  const fields = input.fields.filter((field) => field.label.trim().length > 0);
  const stableKey = await allocateStableKey(client, name);
  return client.catalogLogDefinition.create({
    data: {
      id: cuidLike(),
      stableKey,
      version: 1,
      status: "DRAFT",
      name,
      description: input.description?.trim() || null,
      instructions: input.instructions?.trim() || null,
      purposeType: input.purposeType,
      category: input.category,
      recommendedCadence: input.recommendedCadence ?? null,
      fields: { create: fieldCreates(fields) },
    },
    include: { fields: { orderBy: { displaySequence: "asc" } } },
  });
}

export async function updateCatalogDraft(
  client: Db,
  definitionId: string,
  input: CatalogDefinitionInput,
  options?: CatalogWriteOptions,
) {
  maybeRequireFlag(options);
  const row = await client.catalogLogDefinition.findUnique({ where: { id: definitionId } });
  if (!row) throw new Error("Catalog definition not found.");
  assertCatalogPublishedImmutable(row.status);
  if (row.status !== "DRAFT") {
    throw new Error("Only draft Catalog definitions can be edited.");
  }
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  const fields = input.fields.filter((field) => field.label.trim().length > 0);

  await client.catalogLogField.deleteMany({ where: { definitionId } });
  return client.catalogLogDefinition.update({
    where: { id: definitionId },
    data: {
      name,
      description: input.description?.trim() || null,
      instructions: input.instructions?.trim() || null,
      purposeType: input.purposeType,
      category: input.category,
      recommendedCadence: input.recommendedCadence ?? null,
      fields: { create: fieldCreates(fields) },
    },
    include: { fields: { orderBy: { displaySequence: "asc" } } },
  });
}

export async function deleteCatalogDraft(
  client: Db,
  definitionId: string,
  options?: CatalogWriteOptions,
) {
  maybeRequireFlag(options);
  const row = await client.catalogLogDefinition.findUnique({ where: { id: definitionId } });
  if (!row) throw new Error("Catalog definition not found.");
  if (row.status !== "DRAFT") {
    throw new Error("Only unused drafts can be deleted.");
  }
  await client.catalogLogDefinition.delete({ where: { id: definitionId } });
  return row;
}

export const HARBOR_CATALOG_WRITE: CatalogWriteOptions = { requireFeatureFlag: false };

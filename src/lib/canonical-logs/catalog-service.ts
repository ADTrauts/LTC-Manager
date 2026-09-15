import type {
  CatalogLogStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { randomBytes } from "node:crypto";

import { isCanonicalLogsEnabled } from "@/lib/feature-flags";

type Db = PrismaClient | Prisma.TransactionClient;

export type CatalogActor = {
  userId?: string | null;
};

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function requireFlag() {
  if (!isCanonicalLogsEnabled()) {
    throw new Error("Canonical Logs are not enabled (CANONICAL_LOGS_ENABLED).");
  }
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
) {
  requireFlag();
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

export async function retireCatalogDefinition(client: Db, definitionId: string) {
  requireFlag();
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
export async function createCatalogDraftSuccessor(client: Db, fromDefinitionId: string) {
  requireFlag();
  const source = await client.catalogLogDefinition.findUnique({
    where: { id: fromDefinitionId },
    include: { fields: { orderBy: { displaySequence: "asc" } } },
  });
  if (!source) throw new Error("Catalog definition not found.");
  if (source.status !== "PUBLISHED" && source.status !== "RETIRED") {
    throw new Error("Successor drafts are created from published or retired versions.");
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

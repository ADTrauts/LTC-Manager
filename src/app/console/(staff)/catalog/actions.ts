"use server";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import type {
  CatalogLogCategory,
  CatalogLogPurposeType,
  CatalogRecommendedCadence,
  OperationalEvidenceFieldType,
} from "@prisma/client";
import { z } from "zod";

import { requireHarborStaff } from "@/lib/harbor-console/auth";
import {
  createCatalogDefinition,
  createCatalogDraftSuccessor,
  deleteCatalogDraft,
  HARBOR_CATALOG_WRITE,
  publishCatalogDefinition,
  retireCatalogDefinition,
  updateCatalogDraft,
  type CatalogFieldInput,
} from "@/lib/canonical-logs/catalog-service";
import { prisma } from "@/lib/prisma";

export type CatalogActionResult = { ok: true } | { ok: false; error: string };

const FIELD_TYPES = [
  "TEMPERATURE",
  "NUMBER",
  "SHORT_TEXT",
  "YES_NO",
  "PASS_NEEDS_ATTENTION",
  "SINGLE_SELECT",
  "ATTESTATION",
  "OPTIONAL_COMMENT",
] as const;

const fieldSchema = z.object({
  label: z.string().trim().min(1).max(120),
  fieldType: z.enum(FIELD_TYPES),
  isRequired: z.boolean().optional(),
  helpText: z.string().max(500).nullable().optional(),
  unitLabel: z.string().max(20).nullable().optional(),
  minNumber: z.number().nullable().optional(),
  maxNumber: z.number().nullable().optional(),
  allowedSelections: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  correctiveActionTrigger: z.boolean().optional(),
  correctiveActionRequired: z.boolean().optional(),
});

const definitionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  instructions: z.string().max(2000).optional(),
  purposeType: z.enum(["LOG", "CHECKLIST"]),
  category: z.enum([
    "TEMPERATURE",
    "SANITATION",
    "CLEANING",
    "EQUIPMENT",
    "FOOD_SAFETY",
    "OPENING_CLOSING",
    "COMPLIANCE",
    "OTHER",
  ]),
  recommendedCadence: z
    .enum([
      "ONCE_DAILY",
      "TWICE_DAILY",
      "THREE_TIMES_DAILY",
      "ONCE_PER_OPERATIONAL_CYCLE",
      "WEEKLY",
      "MONTHLY",
      "AD_HOC",
    ])
    .nullable()
    .optional(),
  fields: z.array(fieldSchema).max(40),
});

function parseDefinition(formData: FormData) {
  let fieldsRaw: unknown = [];
  const json = String(formData.get("fieldsJson") ?? "[]");
  try {
    fieldsRaw = JSON.parse(json);
  } catch {
    throw new Error("Fields could not be read.");
  }
  return definitionSchema.parse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    instructions: String(formData.get("instructions") ?? ""),
    purposeType: String(formData.get("purposeType") ?? "LOG"),
    category: String(formData.get("category") ?? "OTHER"),
    recommendedCadence: String(formData.get("recommendedCadence") ?? "AD_HOC") || "AD_HOC",
    fields: fieldsRaw,
  });
}

function toFieldInput(field: z.infer<typeof fieldSchema>): CatalogFieldInput {
  return {
    label: field.label,
    fieldType: field.fieldType as OperationalEvidenceFieldType,
    isRequired: field.isRequired,
    helpText: field.helpText ?? null,
    unitLabel: field.unitLabel ?? null,
    minNumber: field.minNumber ?? null,
    maxNumber: field.maxNumber ?? null,
    allowedSelections: field.allowedSelections ?? [],
    correctiveActionTrigger: field.correctiveActionTrigger,
    correctiveActionRequired: field.correctiveActionRequired,
  };
}

function fail(error: unknown): CatalogActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Catalog update failed." };
}

export async function createHarborCatalogAction(formData: FormData): Promise<CatalogActionResult> {
  const staff = await requireHarborStaff();
  try {
    const parsed = parseDefinition(formData);
    const created = await createCatalogDefinition(
      prisma,
      {
        name: parsed.name,
        description: parsed.description,
        instructions: parsed.instructions,
        purposeType: parsed.purposeType as CatalogLogPurposeType,
        category: parsed.category as CatalogLogCategory,
        recommendedCadence: parsed.recommendedCadence as CatalogRecommendedCadence,
        fields: parsed.fields.map(toFieldInput),
      },
      HARBOR_CATALOG_WRITE,
    );
    await prisma.harborAuditEvent.create({
      data: { staffId: staff.uid, action: "CATALOG_CREATE" },
    });
    revalidatePath("/console/catalog");
    redirect(`/console/catalog/${created.stableKey}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return fail(error);
  }
}

export async function saveHarborCatalogDraftAction(formData: FormData): Promise<CatalogActionResult> {
  await requireHarborStaff();
  const definitionId = String(formData.get("definitionId") ?? "");
  const stableKey = String(formData.get("stableKey") ?? "");
  try {
    const parsed = parseDefinition(formData);
    await updateCatalogDraft(
      prisma,
      definitionId,
      {
        name: parsed.name,
        description: parsed.description,
        instructions: parsed.instructions,
        purposeType: parsed.purposeType as CatalogLogPurposeType,
        category: parsed.category as CatalogLogCategory,
        recommendedCadence: parsed.recommendedCadence as CatalogRecommendedCadence,
        fields: parsed.fields.map(toFieldInput),
      },
      HARBOR_CATALOG_WRITE,
    );
    revalidatePath("/console/catalog");
    revalidatePath(`/console/catalog/${stableKey}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function saveAndPublishHarborCatalogAction(formData: FormData): Promise<CatalogActionResult> {
  const staff = await requireHarborStaff();
  const definitionId = String(formData.get("definitionId") ?? "");
  const stableKey = String(formData.get("stableKey") ?? "");
  try {
    const parsed = parseDefinition(formData);
    await updateCatalogDraft(
      prisma,
      definitionId,
      {
        name: parsed.name,
        description: parsed.description,
        instructions: parsed.instructions,
        purposeType: parsed.purposeType as CatalogLogPurposeType,
        category: parsed.category as CatalogLogCategory,
        recommendedCadence: parsed.recommendedCadence as CatalogRecommendedCadence,
        fields: parsed.fields.map(toFieldInput),
      },
      HARBOR_CATALOG_WRITE,
    );
    await publishCatalogDefinition(prisma, definitionId, undefined, HARBOR_CATALOG_WRITE);
    await prisma.harborAuditEvent.create({
      data: { staffId: staff.uid, action: "CATALOG_PUBLISH" },
    });
    revalidatePath("/console/catalog");
    revalidatePath(`/console/catalog/${stableKey}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function publishHarborCatalogAction(formData: FormData): Promise<CatalogActionResult> {
  const staff = await requireHarborStaff();
  const definitionId = String(formData.get("definitionId") ?? "");
  const stableKey = String(formData.get("stableKey") ?? "");
  try {
    await publishCatalogDefinition(prisma, definitionId, undefined, HARBOR_CATALOG_WRITE);
    await prisma.harborAuditEvent.create({
      data: { staffId: staff.uid, action: "CATALOG_PUBLISH" },
    });
    revalidatePath("/console/catalog");
    revalidatePath(`/console/catalog/${stableKey}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function retireHarborCatalogAction(formData: FormData): Promise<CatalogActionResult> {
  const staff = await requireHarborStaff();
  const definitionId = String(formData.get("definitionId") ?? "");
  const stableKey = String(formData.get("stableKey") ?? "");
  try {
    await retireCatalogDefinition(prisma, definitionId, HARBOR_CATALOG_WRITE);
    await prisma.harborAuditEvent.create({
      data: { staffId: staff.uid, action: "CATALOG_RETIRE" },
    });
    revalidatePath("/console/catalog");
    revalidatePath(`/console/catalog/${stableKey}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function successorHarborCatalogAction(formData: FormData): Promise<CatalogActionResult> {
  const staff = await requireHarborStaff();
  const definitionId = String(formData.get("definitionId") ?? "");
  const stableKey = String(formData.get("stableKey") ?? "");
  try {
    await createCatalogDraftSuccessor(prisma, definitionId, HARBOR_CATALOG_WRITE);
    await prisma.harborAuditEvent.create({
      data: { staffId: staff.uid, action: "CATALOG_DRAFT_SUCCESSOR" },
    });
    revalidatePath("/console/catalog");
    revalidatePath(`/console/catalog/${stableKey}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteHarborCatalogDraftAction(formData: FormData): Promise<CatalogActionResult> {
  await requireHarborStaff();
  const definitionId = String(formData.get("definitionId") ?? "");
  const stableKey = String(formData.get("stableKey") ?? "");
  try {
    const deleted = await deleteCatalogDraft(prisma, definitionId, HARBOR_CATALOG_WRITE);
    revalidatePath("/console/catalog");
    const remaining = await prisma.catalogLogDefinition.count({ where: { stableKey } });
    if (remaining === 0) {
      redirect("/console/catalog");
    }
    revalidatePath(`/console/catalog/${deleted.stableKey}`);
    return { ok: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return fail(error);
  }
}

export async function retireHarborCatalogForm(formData: FormData): Promise<void> {
  await retireHarborCatalogAction(formData);
}

export async function successorHarborCatalogForm(formData: FormData): Promise<void> {
  await successorHarborCatalogAction(formData);
}

export async function deleteHarborCatalogDraftForm(formData: FormData): Promise<void> {
  await deleteHarborCatalogDraftAction(formData);
}

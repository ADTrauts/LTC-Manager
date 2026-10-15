"use server";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import type {
  CatalogLogCategory,
  CatalogLogPurposeType,
  CatalogRecommendedCadence,
  OperationalEvidenceFieldType,
  OperationalTemplateScheduleKind,
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
import {
  CANONICAL_EVIDENCE_FIELD_TYPES,
  parseRecommendedFixedWindows,
} from "@/lib/canonical-logs/catalog-authoring";
import {
  EVIDENCE_RULE_ACTIONS,
  EVIDENCE_RULE_OPERATORS,
  parseCatalogEvidenceRules,
} from "@/lib/canonical-logs/evidence-rules";
import { prisma } from "@/lib/prisma";

export type CatalogActionResult = { ok: true } | { ok: false; error: string };

const fieldSchema = z.object({
  fieldKey: z.string().trim().max(64).optional(),
  label: z.string().trim().min(1).max(120),
  fieldType: z.enum(CANONICAL_EVIDENCE_FIELD_TYPES),
  isRequired: z.boolean().optional(),
  helpText: z.string().max(500).nullable().optional(),
  unitLabel: z.string().max(20).nullable().optional(),
  minNumber: z.number().nullable().optional(),
  maxNumber: z.number().nullable().optional(),
  allowedSelections: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  correctiveActionTrigger: z.boolean().optional(),
  correctiveActionRequired: z.boolean().optional(),
  sectionKey: z.string().trim().max(64).nullable().optional(),
  scoreWeight: z.number().positive().nullable().optional(),
  critical: z.boolean().optional(),
  creditValues: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

const sectionSchema = z.object({
  sectionKey: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  displaySequence: z.number().int(),
});

const definitionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  instructions: z.string().max(2000).optional(),
  purposeType: z.enum(["LOG", "CHECKLIST", "INSPECTION", "PROCEDURE"]),
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
  recommendedScheduleKind: z
    .enum(["OPERATIONAL_CYCLE", "FIXED_DAILY_WINDOW", "ONCE_PER_OPERATIONAL_DATE", "AD_HOC"])
    .nullable()
    .optional(),
  recommendedDaypartLabels: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  recommendedFixedWindows: z
    .array(
      z.object({
        label: z.string().trim().max(40).optional(),
        startLocal: z.string().trim().max(5),
        endLocal: z.string().trim().max(5),
      }),
    )
    .max(8)
    .optional(),
  suggestions: z
    .object({
      assetTypes: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
      spaceTypes: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
      departmentKeys: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
      keywords: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    })
    .optional(),
  fields: z.array(fieldSchema).max(40),
  rules: z
    .array(
      z.object({
        ruleKey: z.string().trim().max(64).optional(),
        sourceFieldKey: z.string().trim().min(1).max(64),
        operator: z.enum(EVIDENCE_RULE_OPERATORS),
        compareValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
        actions: z
          .array(
            z.object({
              kind: z.enum(EVIDENCE_RULE_ACTIONS),
              targetFieldKey: z.string().trim().max(64).nullable().optional(),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .max(20)
    .optional(),
  passingScore: z.number().min(0).max(100).nullable().optional(),
  criticalFailureForcesFailure: z.boolean().optional(),
  sections: z.array(sectionSchema).max(20).optional(),
  repeatingGroups: z.array(z.unknown()).max(20).optional(),
  calculations: z.array(z.unknown()).max(40).optional(),
});

function parseDefinition(formData: FormData) {
  let fieldsRaw: unknown = [];
  const json = String(formData.get("fieldsJson") ?? "[]");
  try {
    fieldsRaw = JSON.parse(json);
  } catch {
    throw new Error("Fields could not be read.");
  }
  let rulesRaw: unknown = [];
  try {
    rulesRaw = JSON.parse(String(formData.get("rulesJson") ?? "[]"));
  } catch {
    throw new Error("Conditions could not be read.");
  }
  let sectionsRaw: unknown = [];
  try {
    sectionsRaw = JSON.parse(String(formData.get("sectionsJson") ?? "[]"));
  } catch {
    throw new Error("Sections could not be read.");
  }
  let groupsRaw: unknown = [];
  let calculationsRaw: unknown = [];
  try {
    groupsRaw = JSON.parse(String(formData.get("groupsJson") ?? "[]"));
    calculationsRaw = JSON.parse(String(formData.get("calculationsJson") ?? "[]"));
  } catch {
    throw new Error("Template structure could not be read.");
  }
  return definitionSchema.parse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    instructions: String(formData.get("instructions") ?? ""),
    purposeType: String(formData.get("purposeType") ?? "LOG"),
    category: String(formData.get("category") ?? "OTHER"),
    recommendedCadence: String(formData.get("recommendedCadence") ?? "AD_HOC") || "AD_HOC",
    recommendedScheduleKind: String(formData.get("recommendedScheduleKind") ?? "") || null,
    recommendedDaypartLabels: tokenizeFormList(formData.get("recommendedDaypartLabels")),
    recommendedFixedWindows: parseWindowsFromForm(formData.get("recommendedFixedWindowsJson")),
    suggestions: {
      assetTypes: tokenizeFormList(formData.get("suggestedAssetTypes")),
      spaceTypes: tokenizeFormList(formData.get("suggestedSpaceTypes")),
      departmentKeys: tokenizeFormList(formData.get("suggestedDepartmentKeys")),
      keywords: tokenizeFormList(formData.get("suggestedKeywords")),
    },
    fields: fieldsRaw,
    rules: parseCatalogEvidenceRules(rulesRaw),
    passingScore: String(formData.get("passingScore") ?? "").trim()
      ? Number(formData.get("passingScore"))
      : null,
    criticalFailureForcesFailure: String(formData.get("criticalFailureForcesFailure") ?? "") === "true",
    sections: sectionsRaw,
    repeatingGroups: groupsRaw,
    calculations: calculationsRaw,
  });
}

function tokenizeFormList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseWindowsFromForm(value: FormDataEntryValue | null) {
  try {
    return parseRecommendedFixedWindows(JSON.parse(String(value ?? "[]")));
  } catch {
    return [];
  }
}

function toFieldInput(field: z.infer<typeof fieldSchema>): CatalogFieldInput {
  return {
    fieldKey: field.fieldKey || null,
    label: field.label,
    fieldType: field.fieldType as OperationalEvidenceFieldType,
    isRequired: field.fieldType === "OPTIONAL_COMMENT" ? false : field.isRequired,
    helpText: field.helpText ?? null,
    unitLabel: field.unitLabel ?? null,
    minNumber: field.minNumber ?? null,
    maxNumber: field.maxNumber ?? null,
    allowedSelections: field.allowedSelections ?? [],
    correctiveActionTrigger: field.correctiveActionTrigger,
    correctiveActionRequired: field.correctiveActionRequired,
    sectionKey: field.sectionKey ?? null,
    scoreWeight: field.scoreWeight ?? null,
    critical: field.critical,
    creditValues: field.creditValues ?? [],
  };
}

function toDefinitionInput(parsed: z.infer<typeof definitionSchema>) {
  return {
    name: parsed.name,
    description: parsed.description,
    instructions: parsed.instructions,
    purposeType: parsed.purposeType as CatalogLogPurposeType,
    category: parsed.category as CatalogLogCategory,
    recommendedCadence: parsed.recommendedCadence as CatalogRecommendedCadence,
    recommendedScheduleKind: (parsed.recommendedScheduleKind ?? null) as OperationalTemplateScheduleKind | null,
    recommendedDaypartLabels: parsed.recommendedDaypartLabels ?? [],
    recommendedFixedWindows: parsed.recommendedFixedWindows ?? [],
    suggestions: parsed.suggestions ?? {},
    fields: parsed.fields.map(toFieldInput),
    rules: parsed.rules ?? [],
    passingScore: parsed.passingScore ?? null,
    criticalFailureForcesFailure: parsed.criticalFailureForcesFailure === true,
    sections: parsed.sections ?? [],
    repeatingGroups: parsed.repeatingGroups ?? [],
    calculations: parsed.calculations ?? [],
  };
}

function fail(error: unknown): CatalogActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Catalog update failed." };
}

export async function createHarborCatalogAction(formData: FormData): Promise<CatalogActionResult> {
  const staff = await requireHarborStaff();
  try {
    const parsed = parseDefinition(formData);
    const created = await createCatalogDefinition(prisma, toDefinitionInput(parsed), HARBOR_CATALOG_WRITE);
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
    await updateCatalogDraft(prisma, definitionId, toDefinitionInput(parsed), HARBOR_CATALOG_WRITE);
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
    await updateCatalogDraft(prisma, definitionId, toDefinitionInput(parsed), HARBOR_CATALOG_WRITE);
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

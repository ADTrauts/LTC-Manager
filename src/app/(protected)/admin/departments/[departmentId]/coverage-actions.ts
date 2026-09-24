"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireFacilitySession } from "@/lib/facility-context";
import {
  createCoverageExpectation,
  publishCoverageExpectation,
  removeCoverageExpectationItem,
  updateCoverageExpectation,
  upsertCoverageExpectationItem,
} from "@/lib/scheduling/coverage-expectations/service";

export type CoverageActionResult =
  | { ok: true; message?: string; expectationId?: string }
  | { ok: false; message: string };

function revalidateCoverage(departmentId: string) {
  revalidatePath(`/admin/departments/${departmentId}`);
  revalidatePath(`/admin/departments/${departmentId}`, "page");
  revalidatePath("/staffing/assignments");
  revalidatePath("/today/coverage");
}

function optionalText(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseKeys(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .map((part) => part.trim())
    .filter(Boolean);
}

function fail(error: unknown): CoverageActionResult {
  const message = error instanceof Error ? error.message : "Could not save Coverage.";
  return { ok: false, message };
}

const createSchema = z.object({
  departmentId: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export async function createCoverageExpectationAction(
  formData: FormData,
): Promise<CoverageActionResult> {
  try {
    const session = await requireFacilitySession();
    const parsed = createSchema.parse({
      departmentId: formData.get("departmentId"),
      name: String(formData.get("name") ?? ""),
      description: optionalText(formData.get("description")) ?? undefined,
    });
    const created = await createCoverageExpectation(session, {
      facilityId: session.facilityId,
      departmentId: parsed.departmentId,
      name: parsed.name,
      description: parsed.description ?? null,
    });
    revalidateCoverage(parsed.departmentId);
    return { ok: true, message: "Draft coverage expectation created.", expectationId: created.id };
  } catch (error) {
    return fail(error);
  }
}

const updateSchema = z.object({
  departmentId: z.string().min(1),
  templateId: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export async function updateCoverageExpectationAction(
  formData: FormData,
): Promise<CoverageActionResult> {
  try {
    const session = await requireFacilitySession();
    const parsed = updateSchema.parse({
      departmentId: formData.get("departmentId"),
      templateId: formData.get("templateId"),
      name: String(formData.get("name") ?? ""),
      description: optionalText(formData.get("description")) ?? undefined,
    });
    const updated = await updateCoverageExpectation(session, {
      facilityId: session.facilityId,
      templateId: parsed.templateId,
      name: parsed.name,
      description: parsed.description ?? null,
    });
    revalidateCoverage(parsed.departmentId);
    return { ok: true, message: "Draft updated.", expectationId: updated.id };
  } catch (error) {
    return fail(error);
  }
}

const itemSchema = z.object({
  departmentId: z.string().min(1),
  templateId: z.string().min(1),
  itemId: z.string().min(1).optional(),
  roleKey: z.string().min(1),
  requiredCount: z.coerce.number().int().min(1).max(50),
  operationalTypeKeys: z.array(z.string().min(1)),
  cycleStableKeys: z.array(z.string().min(1)),
});

export async function upsertCoverageExpectationItemAction(
  formData: FormData,
): Promise<CoverageActionResult> {
  try {
    const session = await requireFacilitySession();
    const parsed = itemSchema.parse({
      departmentId: formData.get("departmentId"),
      templateId: formData.get("templateId"),
      itemId: optionalText(formData.get("itemId")) ?? undefined,
      roleKey: formData.get("roleKey"),
      requiredCount: formData.get("requiredCount") ?? 1,
      operationalTypeKeys: parseKeys(formData, "operationalTypeKeys"),
      cycleStableKeys: parseKeys(formData, "cycleStableKeys"),
    });
    const updated = await upsertCoverageExpectationItem(session, {
      facilityId: session.facilityId,
      templateId: parsed.templateId,
      itemId: parsed.itemId,
      roleKey: parsed.roleKey,
      requiredCount: parsed.requiredCount,
      operationalTypeKeys: parsed.operationalTypeKeys,
      cycleStableKeys: parsed.cycleStableKeys,
    });
    revalidateCoverage(parsed.departmentId);
    return { ok: true, message: "Requirement saved to the working draft.", expectationId: updated.id };
  } catch (error) {
    return fail(error);
  }
}

export async function removeCoverageExpectationItemAction(
  formData: FormData,
): Promise<CoverageActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().min(1).parse(formData.get("departmentId"));
    const templateId = z.string().min(1).parse(formData.get("templateId"));
    const itemId = z.string().min(1).parse(formData.get("itemId"));
    const updated = await removeCoverageExpectationItem(session, {
      facilityId: session.facilityId,
      templateId,
      itemId,
    });
    revalidateCoverage(departmentId);
    return { ok: true, message: "Requirement removed from the working draft.", expectationId: updated.id };
  } catch (error) {
    return fail(error);
  }
}

export async function publishCoverageExpectationAction(
  formData: FormData,
): Promise<CoverageActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().min(1).parse(formData.get("departmentId"));
    const templateId = z.string().min(1).parse(formData.get("templateId"));
    const effectiveFrom = optionalText(formData.get("effectiveFrom"));
    const published = await publishCoverageExpectation(session, {
      facilityId: session.facilityId,
      templateId,
      effectiveFrom,
    });
    revalidateCoverage(departmentId);
    return { ok: true, message: "Coverage expectation published.", expectationId: published.id };
  } catch (error) {
    return fail(error);
  }
}

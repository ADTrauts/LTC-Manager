"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertFacilityAdministratorAction } from "@/lib/facility-admin-guard";
import { requireFacilitySession } from "@/lib/facility-context";
import {
  assignDepartmentOperator,
  cancelFutureDepartmentOperatorChange,
  createOrganizationForDepartmentOperator,
  DepartmentOperatorError,
  searchOrganizationsForOperator,
} from "@/lib/department-operators";
import { normalizeOrganizationKey } from "@/lib/organization";
import { prisma } from "@/lib/prisma";

function revalidateOperatorViews(departmentId: string) {
  revalidatePath("/admin/departments");
  revalidatePath(`/admin/departments/${departmentId}/manage`);
  revalidatePath(`/admin/departments/${departmentId}/manage/operator`);
}

export type OperatorActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

const assignSchema = z.object({
  departmentId: z.string().cuid(),
  organizationId: z.string().cuid(),
  effectiveFromKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  externalAccountCode: z.string().trim().max(120).optional(),
  contractReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
  replaceFutureScheduled: z.enum(["on", "off"]).optional(),
});

export async function assignDepartmentOperatorAction(
  formData: FormData,
): Promise<OperatorActionResult> {
  const session = await requireFacilitySession();
  assertFacilityAdministratorAction(session.role);

  const parsed = assignSchema.safeParse({
    departmentId: formData.get("departmentId"),
    organizationId: formData.get("organizationId"),
    effectiveFromKey: formData.get("effectiveFromKey"),
    externalAccountCode: optionalString(formData.get("externalAccountCode")),
    contractReference: optionalString(formData.get("contractReference")),
    notes: optionalString(formData.get("notes")),
    replaceFutureScheduled:
      formData.get("replaceFutureScheduled") === "on" ? "on" : "off",
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await assignDepartmentOperator(prisma, {
      departmentId: parsed.data.departmentId,
      facilityId: session.facilityId,
      organizationId: parsed.data.organizationId,
      effectiveFromKey: parsed.data.effectiveFromKey,
      externalAccountCode: parsed.data.externalAccountCode ?? null,
      contractReference: parsed.data.contractReference ?? null,
      notes: parsed.data.notes ?? null,
      createdByUserId: session.uid,
      replaceFutureScheduled: parsed.data.replaceFutureScheduled === "on",
    });
    revalidateOperatorViews(parsed.data.departmentId);
    return { ok: true, message: "Operating organization saved." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof DepartmentOperatorError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not save operating organization.",
    };
  }
}

const createAndAssignSchema = z.object({
  departmentId: z.string().cuid(),
  organizationName: z.string().trim().min(2).max(200),
  effectiveFromKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  externalAccountCode: z.string().trim().max(120).optional(),
  contractReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
  replaceFutureScheduled: z.enum(["on", "off"]).optional(),
});

/**
 * Create a new Organization for operator identity, then assign it.
 *
 * Boundary (Phase 1):
 * - Creates an `Organization` row only (no membership/ownership).
 * - Does not grant Facility access or change Facility.organizationId.
 * - Does not authorize editing that Organization's canonical identity.
 *   Admin → Organization settings still edit only the session Facility's parent
 *   Organization via loadOrganizationContext(session.facilityId).
 * - Selecting an existing Organization as operator likewise grants no edit rights.
 */
export async function createOrganizationAndAssignOperatorAction(
  formData: FormData,
): Promise<OperatorActionResult> {
  const session = await requireFacilitySession();
  assertFacilityAdministratorAction(session.role);

  const parsed = createAndAssignSchema.safeParse({
    departmentId: formData.get("departmentId"),
    organizationName: formData.get("organizationName"),
    effectiveFromKey: formData.get("effectiveFromKey"),
    externalAccountCode: optionalString(formData.get("externalAccountCode")),
    contractReference: optionalString(formData.get("contractReference")),
    notes: optionalString(formData.get("notes")),
    replaceFutureScheduled:
      formData.get("replaceFutureScheduled") === "on" ? "on" : "off",
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const normalized = normalizeOrganizationKey(parsed.data.organizationName);
    const existing = await prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true, name: true, displayName: true },
      take: 200,
    });
    const match = existing.find(
      (row) =>
        normalizeOrganizationKey(row.name) === normalized ||
        (row.displayName && normalizeOrganizationKey(row.displayName) === normalized),
    );

    const organization =
      match ??
      (await createOrganizationForDepartmentOperator(prisma, {
        name: parsed.data.organizationName,
        organizationType: "MANAGEMENT_COMPANY",
      }));

    await assignDepartmentOperator(prisma, {
      departmentId: parsed.data.departmentId,
      facilityId: session.facilityId,
      organizationId: organization.id,
      effectiveFromKey: parsed.data.effectiveFromKey,
      externalAccountCode: parsed.data.externalAccountCode ?? null,
      contractReference: parsed.data.contractReference ?? null,
      notes: parsed.data.notes ?? null,
      createdByUserId: session.uid,
      replaceFutureScheduled: parsed.data.replaceFutureScheduled === "on",
    });
    revalidateOperatorViews(parsed.data.departmentId);
    return {
      ok: true,
      message: match
        ? `Using existing organization “${match.displayName ?? match.name}”.`
        : "Organization created and assigned.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof DepartmentOperatorError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not create or assign organization.",
    };
  }
}

const cancelSchema = z.object({
  departmentId: z.string().cuid(),
  relationshipId: z.string().cuid(),
});

export async function cancelFutureDepartmentOperatorAction(
  formData: FormData,
): Promise<OperatorActionResult> {
  const session = await requireFacilitySession();
  assertFacilityAdministratorAction(session.role);

  const parsed = cancelSchema.safeParse({
    departmentId: formData.get("departmentId"),
    relationshipId: formData.get("relationshipId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Invalid cancel request." };
  }

  try {
    await cancelFutureDepartmentOperatorChange(prisma, {
      departmentId: parsed.data.departmentId,
      facilityId: session.facilityId,
      relationshipId: parsed.data.relationshipId,
    });
    revalidateOperatorViews(parsed.data.departmentId);
    return { ok: true, message: "Scheduled operator change canceled." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof DepartmentOperatorError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not cancel scheduled change.",
    };
  }
}

const searchSchema = z.object({
  query: z.string().trim().min(1).max(200),
});

export async function searchOperatorOrganizationsAction(
  query: string,
): Promise<
  | { ok: true; results: Array<{ id: string; label: string; detail: string }> }
  | { ok: false; message: string }
> {
  const session = await requireFacilitySession();
  assertFacilityAdministratorAction(session.role);

  const parsed = searchSchema.safeParse({ query });
  if (!parsed.success) {
    return { ok: false, message: "Enter a search term." };
  }

  const results = await searchOrganizationsForOperator(prisma, {
    query: parsed.data.query,
    limit: 25,
  });

  return {
    ok: true,
    results: results.map((row) => ({
      id: row.id,
      label: row.displayName?.trim() || row.name,
      detail: [
        row.organizationType ?? "Organization",
        row.legalName && row.legalName !== row.name ? row.legalName : null,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
  };
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

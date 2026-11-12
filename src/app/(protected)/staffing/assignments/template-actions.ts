"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { sessionUserIdForFk } from "@/lib/auth";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { isCoverageTemplateEffectiveOnDate } from "@/lib/scheduling/coverage-expectations/publication";
import {
  applyAssignmentTemplate,
  loadAssignmentTemplatePreview,
  loadDailyAssignmentBoard,
  resolveAssignmentAuthority,
  requireAssignmentManage,
} from "@/lib/scheduling/operational-assignments";

const COVERAGE_AUTHORING_MOVED =
  "Coverage requirements are authored in Department Builder. This board cannot create or change a draft.";

function revalidateViews() {
  revalidatePath("/staffing/assignments");
  revalidatePath("/staffing");
  revalidatePath("/today");
  revalidatePath("/today/coverage");
  revalidatePath("/unit/[unitId]", "page");
  revalidatePath("/dashboard");
}

async function rejectCoverageAuthoring(formData: FormData): Promise<void> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");
  if (!(formData instanceof FormData)) {
    throw new Error(COVERAGE_AUTHORING_MOVED);
  }
  throw new Error(COVERAGE_AUTHORING_MOVED);
}

export async function createTemplateAction(formData: FormData) {
  await rejectCoverageAuthoring(formData);
}

export async function editTemplateAction(formData: FormData) {
  await rejectCoverageAuthoring(formData);
}

export async function addTemplateItemAction(formData: FormData) {
  await rejectCoverageAuthoring(formData);
}

export async function removeTemplateItemAction(formData: FormData) {
  await rejectCoverageAuthoring(formData);
}

export async function moveTemplateItemAction(formData: FormData) {
  await rejectCoverageAuthoring(formData);
}

const applySchema = z.object({
  templateId: z.string().min(1),
  departmentId: z.string().min(1),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function applyTemplateAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = applySchema.parse({
    templateId: formData.get("templateId"),
    departmentId: formData.get("departmentId"),
    serviceDate: formData.get("serviceDate"),
  });

  const department = await prisma.department.findFirst({
    where: { id: parsed.departmentId, facilityId: session.facilityId },
    select: { id: true, key: true },
  });
  if (!department) throw new Error("Department not found.");
  requireAssignmentManage(await resolveAssignmentAuthority({
    session, facilityId: session.facilityId, departmentId: department.id,
  }));

  const template = await prisma.operationalAssignmentTemplate.findFirst({
    where: {
      id: parsed.templateId,
      facilityId: session.facilityId,
      departmentId: parsed.departmentId,
    },
    select: {
      id: true,
      status: true,
      isActive: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  });
  if (!template || !isCoverageTemplateEffectiveOnDate(template, parsed.serviceDate)) {
    throw new Error(
      "Only a published Coverage requirement that is effective on this service date can be applied.",
    );
  }

  const board = await loadDailyAssignmentBoard({
    facilityId: session.facilityId,
    serviceDate: parsed.serviceDate,
    departmentId: parsed.departmentId,
    departmentKey: department.key as OperationalDepartmentKey,
  });

  const preview = await loadAssignmentTemplatePreview(
    {
      templateId: parsed.templateId,
      facilityId: session.facilityId,
      departmentId: parsed.departmentId,
      serviceDate: parsed.serviceDate,
    },
    board.employees,
    board.assignments,
  );

  const result = await applyAssignmentTemplate({
    facilityId: session.facilityId,
    departmentId: parsed.departmentId,
    departmentKey: department.key,
    serviceDate: parsed.serviceDate,
    positions: preview.positions,
    createdByUserId: sessionUserIdForFk(session),
  });

  revalidateViews();
  const query = new URLSearchParams({ department: department.id, date: parsed.serviceDate,
    notice: `${result.created} Assignment(s) created; ${result.skipped} skipped.${result.warnings.length ? ` ${[...new Set(result.warnings)].join(" ")}` : ""}` });
  redirect(`/staffing/assignments?${query}`);
}

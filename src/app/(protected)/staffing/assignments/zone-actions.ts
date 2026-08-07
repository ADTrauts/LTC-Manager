"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sessionUserIdForFk } from "@/lib/auth";
import {
  createDepartmentZone,
  retireDepartmentZone,
  updateDepartmentZone,
} from "@/lib/department-zones";
import { requireFacilitySession } from "@/lib/facility-context";
import { isEvsOperationsEnabled, isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import {
  requireAssignmentManage,
  resolveAssignmentAuthority,
} from "@/lib/scheduling/operational-assignments/assignment-authority";

function opt(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}

function parseSpaceIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean))];
}

function requireFlags() {
  if (!isOperationalAssignmentsEnabled()) {
    throw new Error("Operational assignments are not enabled.");
  }
  if (!isEvsOperationsEnabled()) {
    throw new Error("EVS operations are not enabled.");
  }
}

async function requireManage(session: Awaited<ReturnType<typeof requireFacilitySession>>, departmentId: string) {
  const decision = await resolveAssignmentAuthority({
    session,
    departmentId,
    facilityId: session.facilityId,
  });
  requireAssignmentManage(decision);
}

const createSchema = z.object({
  departmentId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  unitSpaceIds: z.string().optional(),
  activate: z.enum(["true", "false"]).optional(),
});

const updateSchema = z.object({
  zoneId: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  unitSpaceIds: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE"]).optional(),
});

const retireSchema = z.object({
  zoneId: z.string().min(1),
});

export async function createDepartmentZoneAction(formData: FormData) {
  requireFlags();
  const session = await requireFacilitySession();
  const parsed = createSchema.parse({
    departmentId: formData.get("departmentId"),
    name: formData.get("name"),
    description: opt(formData.get("description")),
    unitSpaceIds: opt(formData.get("unitSpaceIds")),
    activate: opt(formData.get("activate")) as "true" | "false" | undefined,
  });
  await requireManage(session, parsed.departmentId);

  const dept = await prisma.department.findFirst({
    where: { id: parsed.departmentId, facilityId: session.facilityId, key: "EVS" },
    select: { id: true },
  });
  if (!dept) throw new Error("EVS Department not found.");

  await createDepartmentZone(prisma, {
    facilityId: session.facilityId,
    departmentId: dept.id,
    name: parsed.name,
    description: parsed.description ?? null,
    unitSpaceIds: parseSpaceIds(parsed.unitSpaceIds),
    actorUserId: sessionUserIdForFk(session),
    activate: parsed.activate === "true",
  });

  revalidatePath("/staffing/assignments");
  revalidatePath("/staffing/operations");
}

export async function updateDepartmentZoneAction(formData: FormData) {
  requireFlags();
  const session = await requireFacilitySession();
  const parsed = updateSchema.parse({
    zoneId: formData.get("zoneId"),
    name: opt(formData.get("name")),
    description: opt(formData.get("description")),
    unitSpaceIds: opt(formData.get("unitSpaceIds")),
    status: opt(formData.get("status")) as "DRAFT" | "ACTIVE" | undefined,
  });

  const zone = await prisma.departmentOperationalZone.findFirst({
    where: { id: parsed.zoneId, facilityId: session.facilityId },
    select: { id: true, departmentId: true },
  });
  if (!zone) throw new Error("Zone not found.");
  await requireManage(session, zone.departmentId);

  await updateDepartmentZone(prisma, {
    facilityId: session.facilityId,
    zoneId: zone.id,
    name: parsed.name,
    description: parsed.description,
    unitSpaceIds: parsed.unitSpaceIds !== undefined ? parseSpaceIds(parsed.unitSpaceIds) : undefined,
    status: parsed.status,
    actorUserId: sessionUserIdForFk(session),
  });

  revalidatePath("/staffing/assignments");
  revalidatePath("/staffing/operations");
}

export async function retireDepartmentZoneAction(formData: FormData) {
  requireFlags();
  const session = await requireFacilitySession();
  const parsed = retireSchema.parse({
    zoneId: formData.get("zoneId"),
  });

  const zone = await prisma.departmentOperationalZone.findFirst({
    where: { id: parsed.zoneId, facilityId: session.facilityId },
    select: { id: true, departmentId: true },
  });
  if (!zone) throw new Error("Zone not found.");
  await requireManage(session, zone.departmentId);

  await retireDepartmentZone(prisma, {
    facilityId: session.facilityId,
    zoneId: zone.id,
    actorUserId: sessionUserIdForFk(session),
  });

  revalidatePath("/staffing/assignments");
  revalidatePath("/staffing/operations");
}

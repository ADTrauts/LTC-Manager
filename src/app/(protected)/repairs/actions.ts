"use server";

import { revalidatePath } from "next/cache";
import { RepairPriority, RepairStatus } from "@prisma/client";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";

const priorityValues = [
  RepairPriority.LOW,
  RepairPriority.MEDIUM,
  RepairPriority.HIGH,
  RepairPriority.URGENT,
] as const;

const statusValues = [
  RepairStatus.OPEN,
  RepairStatus.IN_PROGRESS,
  RepairStatus.WAITING_PARTS,
  RepairStatus.CLOSED,
] as const;

const createRepairSchema = z.object({
  unitId: z.string().cuid(),
  assetId: z.string().cuid().optional(),
  vendorId: z.string().cuid().optional(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(1000),
  priority: z.enum(priorityValues),
});

const addUpdateSchema = z.object({
  repairId: z.string().cuid(),
  updateText: z.string().trim().min(2).max(1000),
  statusAfterUpdate: z.enum(statusValues),
});

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function revalidateRepairViews() {
  revalidatePath("/repairs");
  revalidatePath("/dashboard");
  revalidatePath("/unit/[unitId]", "page");
}

export async function createRepairAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  const parsed = createRepairSchema.parse({
    unitId: formData.get("unitId"),
    assetId: toOptional(formData.get("assetId")),
    vendorId: toOptional(formData.get("vendorId")),
    title: formData.get("title"),
    description: formData.get("description"),
    priority: formData.get("priority"),
  });

  const existingCount = await prisma.repair.count();
  const repairCode = `R-${String(existingCount + 1).padStart(5, "0")}`;

  await prisma.repair.create({
    data: {
      repairCode,
      unitId: parsed.unitId,
      assetId: parsed.assetId,
      vendorId: parsed.vendorId,
      title: parsed.title,
      description: parsed.description,
      priority: parsed.priority,
      reportedById: session.authKind === "user" ? session.uid : undefined,
      status: RepairStatus.OPEN,
    },
  });

  revalidateRepairViews();
}

export async function addRepairUpdateAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  const parsed = addUpdateSchema.parse({
    repairId: formData.get("repairId"),
    updateText: formData.get("updateText"),
    statusAfterUpdate: formData.get("statusAfterUpdate"),
  });

  const repair = await prisma.repair.findFirst({
    where: { id: parsed.repairId, unit: { facilityId: session.facilityId } },
    select: { id: true },
  });
  if (!repair) {
    throw new Error("Repair not found.");
  }

  await prisma.$transaction([
    prisma.repairUpdate.create({
      data: {
        repairId: parsed.repairId,
        updateText: parsed.updateText,
        updatedById: session.authKind === "user" ? session.uid : undefined,
        statusAfterUpdate: parsed.statusAfterUpdate,
      },
    }),
    prisma.repair.update({
      where: { id: parsed.repairId },
      data: {
        status: parsed.statusAfterUpdate,
        completedAt:
          parsed.statusAfterUpdate === RepairStatus.CLOSED ? new Date() : null,
      },
    }),
  ]);

  revalidateRepairViews();
}

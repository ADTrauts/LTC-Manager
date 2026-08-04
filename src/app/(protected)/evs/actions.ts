"use server";

import { revalidatePath } from "next/cache";
import { RoomAreaOperationalStatus } from "@prisma/client";
import { z } from "zod";

import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";

const statusSchema = z.object({
  unitId: z.string().cuid(),
  status: z.nativeEnum(RoomAreaOperationalStatus),
  notes: z.string().trim().max(500).optional(),
});

export async function setRoomAreaStatusAction(formData: FormData) {
  const session = await requireFacilitySession();

  const parsed = statusSchema.parse({
    unitId: formData.get("unitId"),
    status: formData.get("status"),
    notes: typeof formData.get("notes") === "string" ? formData.get("notes") : undefined,
  });

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId, isActive: true },
    select: {
      id: true,
      departmentResponsibilities: {
        where: { department: { key: "EVS" } },
        select: { id: true },
      },
    },
  });
  if (!unit || unit.departmentResponsibilities.length === 0) {
    throw new Error("Unit is not in EVS scope for this facility.");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let updatedByEmployeeId: string | null = null;
  if (session.authKind === "employee") {
    updatedByEmployeeId = session.uid;
  }

  await prisma.roomAreaStatus.upsert({
    where: { unitId_statusDate: { unitId: parsed.unitId, statusDate: today } },
    update: {
      status: parsed.status,
      notes: parsed.notes ?? null,
      updatedByEmployeeId,
    },
    create: {
      facilityId: session.facilityId,
      unitId: parsed.unitId,
      statusDate: today,
      status: parsed.status,
      notes: parsed.notes ?? null,
      updatedByEmployeeId,
    },
  });

  revalidatePath("/evs");
  revalidatePath("/dashboard");
}

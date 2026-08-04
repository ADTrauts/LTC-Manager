import { UnitType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import {
  backfillUnitDepartmentResponsibilities,
  ensureDefaultDepartments,
} from "@/lib/ensure-default-departments";
import { trackEvent } from "@/lib/telemetry";

const locationRowSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    unitType: z.nativeEnum(UnitType).default(UnitType.OTHER),
    parentUnitId: z.string().cuid().optional(),
    parentName: z.string().trim().min(2).max(120).optional(),
  })
  .superRefine((row, ctx) => {
    if (row.parentUnitId && row.parentName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use either parentUnitId or parentName, not both.",
      });
    }
  });

const locationSchema = z.object({
  locations: z.array(locationRowSchema).max(20),
});

export async function POST(request: Request) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");

  const body = await request.json().catch(() => null);
  const parsed = locationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid location payload." }, { status: 400 });
  }

  const incoming = parsed.data.locations;
  if (incoming.length === 0) {
    await prisma.facility.update({
      where: { id: session.facilityId },
      data: { onboardingCurrentStep: "billing", onboardingStartedAt: new Date() },
    });
    return NextResponse.json({ ok: true, created: 0 });
  }

  const existing = await prisma.unit.findMany({
    where: { facilityId: session.facilityId },
    select: { id: true, name: true },
  });
  const existingNames = new Set(existing.map((unit) => unit.name.toLowerCase()));

  const normalized = incoming.filter((item, idx, arr) => {
    const lower = item.name.toLowerCase();
    return arr.findIndex((x) => x.name.toLowerCase() === lower) === idx && !existingNames.has(lower);
  });

  if (normalized.length > 0) {
    const maxDisplayOrder = await prisma.unit.aggregate({
      where: { facilityId: session.facilityId },
      _max: { displayOrder: true },
    });
    const startOrder = maxDisplayOrder._max.displayOrder ?? 0;

    const nameToId = new Map<string, string>(existing.map((unit) => [unit.name.toLowerCase(), unit.id]));

    let displayOrder = startOrder;
    for (const item of normalized) {
      let resolvedParentId: string | undefined = item.parentUnitId;

      if (item.parentName) {
        const key = item.parentName.toLowerCase();
        if (key === item.name.toLowerCase()) {
          return NextResponse.json({ error: "A location cannot be its own parent." }, { status: 400 });
        }
        const fromMap = nameToId.get(key);
        if (!fromMap) {
          return NextResponse.json(
            { error: `Unknown parent location "${item.parentName}". Add the parent first or match the name exactly.` },
            { status: 400 },
          );
        }
        resolvedParentId = fromMap;
      } else if (item.parentUnitId) {
        const parent = await prisma.unit.findFirst({
          where: { id: item.parentUnitId, facilityId: session.facilityId },
          select: { id: true },
        });
        if (!parent) {
          return NextResponse.json({ error: "Invalid parent unit for one of the locations." }, { status: 400 });
        }
        resolvedParentId = parent.id;
      }

      displayOrder += 1;
      const created = await prisma.unit.create({
        data: {
          facilityId: session.facilityId,
          name: item.name,
          unitType: item.unitType,
          parentUnitId: resolvedParentId,
          displayOrder,
        },
        select: { id: true },
      });
      nameToId.set(item.name.toLowerCase(), created.id);
    }

    const departmentIds = await ensureDefaultDepartments(prisma, session.facilityId);
    await backfillUnitDepartmentResponsibilities(prisma, session.facilityId, departmentIds);
  }

  await prisma.facility.update({
    where: { id: session.facilityId },
    data: { onboardingCurrentStep: "billing", onboardingStartedAt: new Date() },
  });

  await trackEvent("onboarding.locations.saved", { facilityId: session.facilityId, locationCount: normalized.length });

  return NextResponse.json({ ok: true, created: normalized.length });
}

import { UnitType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

const locationSchema = z.object({
  locations: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(120),
        unitType: z.nativeEnum(UnitType).default(UnitType.OTHER),
      }),
    )
    .max(20),
});

export async function POST(request: Request) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "GM");

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
    select: { name: true },
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

    await prisma.unit.createMany({
      data: normalized.map((item, index) => ({
        facilityId: session.facilityId,
        name: item.name,
        unitType: item.unitType,
        displayOrder: startOrder + index + 1,
      })),
    });
  }

  await prisma.facility.update({
    where: { id: session.facilityId },
    data: { onboardingCurrentStep: "billing", onboardingStartedAt: new Date() },
  });

  await trackEvent("onboarding.locations.saved", { facilityId: session.facilityId, locationCount: normalized.length });

  return NextResponse.json({ ok: true, created: normalized.length });
}

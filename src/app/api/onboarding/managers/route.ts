import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

const managerSchema = z.object({
  emails: z.array(z.string().email().max(200)).max(20),
});

export async function POST(request: Request) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "GM");

  const body = await request.json().catch(() => null);
  const parsed = managerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid manager emails." }, { status: 400 });
  }

  const emails = [...new Set(parsed.data.emails.map((email) => email.toLowerCase()))];
  if (emails.length === 0) {
    return NextResponse.json({ ok: true, created: 0 });
  }

  const created = await prisma.$transaction(async (tx) => {
    let count = 0;
    for (const email of emails) {
      await tx.onboardingManagerInvite.upsert({
        where: {
          facilityId_email: {
            facilityId: session.facilityId,
            email,
          },
        },
        update: {},
        create: {
          facilityId: session.facilityId,
          email,
        },
      });
      count += 1;
    }
    await tx.facility.update({
      where: { id: session.facilityId },
      data: {
        onboardingCurrentStep: "locations",
        onboardingStartedAt: new Date(),
      },
    });
    return count;
  });

  await trackEvent("onboarding.managers.saved", { facilityId: session.facilityId, managerCount: created });

  return NextResponse.json({ ok: true, created });
}

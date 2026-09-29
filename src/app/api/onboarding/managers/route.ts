import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { isEmailConfigured, sendManagerInviteEmail } from "@/lib/email";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

const managerSchema = z.object({
  emails: z.array(z.string().email().max(200)).max(20),
});

export async function POST(request: Request) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");

  const body = await request.json().catch(() => null);
  const parsed = managerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid manager emails." }, { status: 400 });
  }

  const emails = [...new Set(parsed.data.emails.map((email) => email.toLowerCase()))];
  if (emails.length === 0) {
    return NextResponse.json({
      ok: true,
      created: 0,
      emailsSent: 0,
      emailsSkipped: 0,
      emailsFailed: 0,
    });
  }

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: { displayName: true },
  });
  if (!facility) {
    return NextResponse.json({ error: "Facility not found." }, { status: 404 });
  }

  const existing = await prisma.onboardingManagerInvite.findMany({
    where: {
      facilityId: session.facilityId,
      email: { in: emails },
    },
    select: { email: true },
  });
  const existingEmails = new Set(existing.map((row) => row.email.toLowerCase()));
  const newEmails = emails.filter((email) => !existingEmails.has(email));

  const created = await prisma.$transaction(async (tx) => {
    if (newEmails.length > 0) {
      await tx.onboardingManagerInvite.createMany({
        data: newEmails.map((email) => ({
          facilityId: session.facilityId,
          email,
        })),
        skipDuplicates: true,
      });
    }
    await tx.facility.update({
      where: { id: session.facilityId },
      data: {
        onboardingCurrentStep: "departments",
        onboardingStartedAt: new Date(),
      },
    });
    return newEmails.length;
  });

  let emailsSent = 0;
  let emailsSkipped = 0;
  let emailsFailed = 0;

  if (!isEmailConfigured()) {
    emailsSkipped = created;
  } else if (created > 0) {
    const loginUrl = new URL("/login", request.url).toString();
    for (const email of newEmails) {
      const result = await sendManagerInviteEmail({
        to: email,
        facilityDisplayName: facility.displayName,
        loginUrl,
      });
      if (result.sent) {
        emailsSent += 1;
      } else if (result.reason === "not_configured") {
        emailsSkipped += 1;
      } else {
        emailsFailed += 1;
      }
    }
  }

  await trackEvent("onboarding.managers.saved", {
    facilityId: session.facilityId,
    managerCount: created,
    emailsSent,
    emailsSkipped,
    emailsFailed,
  });

  return NextResponse.json({
    ok: true,
    created,
    emailsSent,
    emailsSkipped,
    emailsFailed,
  });
}

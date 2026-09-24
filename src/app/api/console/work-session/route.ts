import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createHarborWorkToken,
  getHarborCookieOptions,
  getHarborSession,
  HARBOR_WORK_COOKIE,
  peekHarborWorkFacilityId,
} from "@/lib/harbor-console/auth";
import { HARBOR_WORK_DEFAULT_PATH } from "@/lib/harbor-console/work-paths";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  facilityId: z.string().trim().min(1).max(64),
});

export async function POST(request: Request) {
  const staff = await getHarborSession();
  if (!staff) {
    return NextResponse.redirect(new URL("/console/login", request.url), 303);
  }

  const form = await request.formData().catch(() => null);
  const parsed = bodySchema.safeParse({
    facilityId: form ? String(form.get("facilityId") ?? "") : "",
  });
  if (!parsed.success) {
    return NextResponse.redirect(new URL("/console/customers", request.url), 303);
  }

  const facility = await prisma.facility.findUnique({
    where: { id: parsed.data.facilityId },
    select: { id: true },
  });
  if (!facility) {
    return NextResponse.redirect(new URL("/console/customers", request.url), 303);
  }

  const previousFacilityId = await peekHarborWorkFacilityId();
  if (previousFacilityId && previousFacilityId !== facility.id) {
    await prisma.harborAuditEvent.create({
      data: {
        staffId: staff.uid,
        action: "WORK_SESSION_END",
        facilityId: previousFacilityId,
      },
    });
  }

  await prisma.harborAuditEvent.create({
    data: {
      staffId: staff.uid,
      action: "WORK_SESSION_START",
      facilityId: facility.id,
    },
  });

  const token = await createHarborWorkToken({
    staffId: staff.uid,
    facilityId: facility.id,
  });
  const response = NextResponse.redirect(new URL(HARBOR_WORK_DEFAULT_PATH, request.url), 303);
  response.cookies.set(HARBOR_WORK_COOKIE, token, getHarborCookieOptions());
  return response;
}

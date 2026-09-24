import { NextResponse } from "next/server";

import {
  getHarborCookieOptions,
  getHarborSession,
  HARBOR_WORK_COOKIE,
  peekHarborWorkFacilityId,
} from "@/lib/harbor-console/auth";
import { harborWorkCustomerPath } from "@/lib/harbor-console/work-paths";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const staff = await getHarborSession();
  const facilityId = await peekHarborWorkFacilityId();

  if (staff && facilityId) {
    await prisma.harborAuditEvent.create({
      data: {
        staffId: staff.uid,
        action: "WORK_SESSION_END",
        facilityId,
      },
    });
  }

  const destination = facilityId
    ? harborWorkCustomerPath(facilityId)
    : staff
      ? "/console/customers"
      : "/console/login";
  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.cookies.set(HARBOR_WORK_COOKIE, "", {
    ...getHarborCookieOptions(),
    maxAge: 0,
  });
  return response;
}

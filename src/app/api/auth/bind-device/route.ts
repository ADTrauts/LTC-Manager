import { NextResponse } from "next/server";
import { z } from "zod";

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { requirePasswordSession } from "@/lib/credential-policy";
import {
  DEVICE_FACILITY_COOKIE,
  DEVICE_UNIT_COOKIE,
  getDeviceCookieOptions,
} from "@/lib/device-cookie";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  unitId: z.string().cuid().nullable().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.facilityId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    requirePasswordSession(session);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Forbidden." },
      { status: 403 },
    );
  }

  if (!hasAtLeastRole(session.role as AppRole, "FACILITY_ADMINISTRATOR")) {
    return NextResponse.json({ error: "Only Facility Administrators can bind this device." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const unitId = parsed.data.unitId ?? null;
  if (unitId) {
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, facilityId: session.facilityId, isActive: true },
      select: { id: true },
    });
    if (!unit) {
      return NextResponse.json({ error: "Unit not found for this facility." }, { status: 400 });
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEVICE_FACILITY_COOKIE, session.facilityId, getDeviceCookieOptions());
  if (unitId) {
    response.cookies.set(DEVICE_UNIT_COOKIE, unitId, getDeviceCookieOptions());
  } else {
    response.cookies.set(DEVICE_UNIT_COOKIE, "", { ...getDeviceCookieOptions(), maxAge: 0 });
  }
  return response;
}

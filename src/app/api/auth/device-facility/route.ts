import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  DEVICE_FACILITY_COOKIE,
  DEVICE_UNIT_COOKIE,
  getDeviceCookieOptions,
} from "@/lib/device-cookie";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const cookieStore = await cookies();
  const facilityId = cookieStore.get(DEVICE_FACILITY_COOKIE)?.value;
  if (!facilityId) {
    return NextResponse.json({ facility: null, unit: null });
  }

  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: { id: true, displayName: true, managementCompanyName: true },
  });

  if (!facility) {
    const res = NextResponse.json({ facility: null, unit: null });
    res.cookies.set(DEVICE_FACILITY_COOKIE, "", { ...getDeviceCookieOptions(), maxAge: 0 });
    res.cookies.set(DEVICE_UNIT_COOKIE, "", { ...getDeviceCookieOptions(), maxAge: 0 });
    return res;
  }

  const rawUnitId = cookieStore.get(DEVICE_UNIT_COOKIE)?.value;
  if (!rawUnitId) {
    return NextResponse.json({ facility, unit: null });
  }

  const unit = await prisma.unit.findFirst({
    where: { id: rawUnitId, facilityId: facility.id, isActive: true },
    select: { id: true, name: true },
  });

  if (!unit) {
    const res = NextResponse.json({ facility, unit: null });
    res.cookies.set(DEVICE_UNIT_COOKIE, "", { ...getDeviceCookieOptions(), maxAge: 0 });
    return res;
  }

  return NextResponse.json({ facility, unit });
}

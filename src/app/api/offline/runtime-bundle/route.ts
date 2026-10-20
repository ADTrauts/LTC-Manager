import { readOfflineBody } from "@/lib/offline/space/body";
import { spaceRequest } from "@/lib/offline/space/http";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { DEVICE_FACILITY_COOKIE, DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import { buildRuntimeBundle } from "@/lib/offline/build-runtime-bundle";

const postSchema = z.object({
  unitId: z.string().cuid(),
});

const NO_STORE = { "Cache-Control": "no-store" };

async function readDeviceContext() {
  const jar = await cookies();
  return {
    deviceFacilityId: jar.get(DEVICE_FACILITY_COOKIE)?.value?.trim() || null,
    deviceBoundUnitId: jar.get(DEVICE_UNIT_COOKIE)?.value?.trim() || null,
  };
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }

  const url = new URL(request.url);
  const unitId = url.searchParams.get("unitId");
  const parsed = postSchema.safeParse({ unitId });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  }

  const device = await readDeviceContext();
  if (!device.deviceFacilityId) {
    return NextResponse.json({ error: "Device not enrolled." }, { status: 403, headers: NO_STORE });
  }

  const built = await buildRuntimeBundle({
    session,
    unitId: parsed.data.unitId,
    deviceFacilityId: device.deviceFacilityId,
    deviceBoundUnitId: device.deviceBoundUnitId,
  });

  if (!built.ok) {
    return NextResponse.json({ error: built.reason }, { status: built.status, headers: NO_STORE });
  }

  return NextResponse.json({ bundle: built.bundle }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }

  let bytes: string;
  try { bytes = await readOfflineBody(request); } catch { return NextResponse.json({error:"Invalid, oversized or timed-out request."},{status:413,headers:NO_STORE}); }
  if (Buffer.byteLength(bytes)>196608) return NextResponse.json({error:"Request too large."},{status:413,headers:NO_STORE});
  const body = (()=>{try{return JSON.parse(bytes);}catch{return null;}})();
  if (body?.protocol === "space/1") return spaceRequest(request, body);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  }

  const device = await readDeviceContext();
  if (!device.deviceFacilityId) {
    return NextResponse.json({ error: "Device not enrolled." }, { status: 403, headers: NO_STORE });
  }

  const built = await buildRuntimeBundle({
    session,
    unitId: parsed.data.unitId,
    deviceFacilityId: device.deviceFacilityId,
    deviceBoundUnitId: device.deviceBoundUnitId,
  });

  if (!built.ok) {
    return NextResponse.json({ error: built.reason }, { status: built.status, headers: NO_STORE });
  }

  return NextResponse.json({ bundle: built.bundle, issuanceId: built.issuanceId }, { headers: NO_STORE });
}

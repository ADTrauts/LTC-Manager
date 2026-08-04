import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createSessionToken, getCookieOptions, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { isUnitAllowedForEmployee } from "@/lib/employee-units";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  unitId: z.string().cuid().nullable(),
});

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let session: Awaited<ReturnType<typeof verifySessionToken>>;
  try {
    session = await verifySessionToken(raw);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const unitId = parsed.data.unitId;
  if (unitId) {
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, facilityId: session.facilityId },
      select: { id: true },
    });
    if (!unit) {
      return NextResponse.json({ error: "Unit not found." }, { status: 400 });
    }
    if (session.authKind === "employee") {
      const ok = await isUnitAllowedForEmployee(session.uid, session.facilityId, unitId);
      const stayingOnCurrent = session.activeUnitId === unitId;
      if (!ok && !stayingOnCurrent) {
        return NextResponse.json({ error: "Unit not allowed for this account." }, { status: 403 });
      }
    }
  }

  const token = await createSessionToken({
    uid: session.uid,
    authKind: session.authKind ?? "user",
    role: session.role,
    name: session.name,
    email: session.email,
    facilityId: session.facilityId,
    activeUnitId: unitId ?? undefined,
    primaryDepartmentId: session.primaryDepartmentId ?? undefined,
    kioskUnitAccessWarning: session.kioskUnitAccessWarning === true ? true : undefined,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, getCookieOptions());
  return response;
}

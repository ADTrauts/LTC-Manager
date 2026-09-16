import { NextResponse } from "next/server";
import { z } from "zod";

import { createSessionToken, getCookieOptions, getSession, SESSION_COOKIE } from "@/lib/auth";
import { isUnitAllowedForEmployee } from "@/lib/employee-units";
import { prisma } from "@/lib/prisma";
import { currentSessionVersionFor } from "@/lib/session-revocation";

const schema = z.object({
  unitId: z.string().cuid().nullable(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.facilityId) {
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

  const liveVersion = await currentSessionVersionFor(
    { kind: session.authKind === "employee" ? "employee" : "user", id: session.uid },
    prisma,
  );
  if (typeof session.sessionVersion !== "number" || session.sessionVersion !== liveVersion) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const token = await createSessionToken({
    uid: session.uid,
    authKind: session.authKind ?? "user",
    authMethod: session.authMethod,
    role: session.role,
    name: session.name,
    email: session.email,
    facilityId: session.facilityId,
    activeUnitId: unitId ?? undefined,
    primaryDepartmentId: session.primaryDepartmentId ?? undefined,
    kioskUnitAccessWarning: session.kioskUnitAccessWarning === true ? true : undefined,
    sessionVersion: liveVersion,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, getCookieOptions());
  return response;
}

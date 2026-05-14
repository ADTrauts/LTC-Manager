import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createSessionToken, getCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { DEVICE_FACILITY_COOKIE, getDeviceCookieOptions } from "@/lib/device-cookie";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { role: true },
  });

  if (!user || !user.isActive || !user.role.isActive) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const token = await createSessionToken({
    uid: user.id,
    authKind: "user",
    role: user.role.key,
    name: user.displayName,
    email: user.email,
    facilityId: user.facilityId,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, getCookieOptions());
  response.cookies.set(DEVICE_FACILITY_COOKIE, user.facilityId, getDeviceCookieOptions());
  return response;
}

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { findValidPasswordResetToken } from "@/lib/password-reset/tokens";
import { prisma } from "@/lib/prisma";
import { revokeUserSessions } from "@/lib/session-revocation";

const confirmSchema = z
  .object({
    token: z.string().min(20).max(200),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "New password and confirm password must match.",
  });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid reset request." },
      { status: 400 },
    );
  }

  const token = await findValidPasswordResetToken(prisma, parsed.data.token.trim());
  if (!token) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findFirst({
    where: { id: token.userId, isActive: true },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await tx.passwordResetToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, id: { not: token.id } },
      data: { usedAt: new Date() },
    });
    await revokeUserSessions(tx, user.id);
  });

  console.info("password_reset_success", { userId: user.id });
  return NextResponse.json({ ok: true, message: "Password updated. You can sign in now." });
}

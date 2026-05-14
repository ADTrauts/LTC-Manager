"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";

import type { ChangePasswordState } from "@/app/(protected)/account/change-password-state";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(128),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "New password and confirm password must match.",
  });

export async function changeOwnPasswordAction(
  _previous: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await requireFacilitySession();
  if (session.authKind !== "user") {
    return { status: "error", message: "Password changes are only available for email/password accounts." };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid password inputs." };
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return { status: "error", message: "New password must be different from the current password." };
  }

  const user = await prisma.user.findFirst({
    where: { id: session.uid, facilityId: session.facilityId, isActive: true },
    select: { id: true, passwordHash: true, email: true },
  });
  if (!user) {
    return { status: "error", message: "User account not found." };
  }

  const isValidCurrent = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!isValidCurrent) {
    return { status: "error", message: "Current password is incorrect." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });
  console.info("password_change_success", { userId: user.id, facilityId: session.facilityId, email: user.email });

  return { status: "success", message: "Password updated." };
}

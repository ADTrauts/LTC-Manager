"use server";

import { z } from "zod";

import type { ChangePasswordState } from "@/app/account/security/change-password-state";
import { changeOwnUserPassword } from "@/lib/account-security/change-own-password";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUserSession } from "@/lib/user-session";

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
  const session = await requireAuthenticatedUserSession();

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

  const result = await changeOwnUserPassword(prisma, {
    userId: session.uid,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
  });
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  console.info("password_change_success", { userId: session.uid, scopeKind: session.scopeKind });
  return { status: "success", message: "Password updated." };
}

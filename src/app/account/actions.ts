"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { UpdateProfileState } from "@/app/account/profile-state";
import { updateOwnDisplayName } from "@/lib/account-security/update-own-display-name";
import {
  applyRemintedUserSessionCookies,
  ContextEntryError,
  remintCurrentUserSession,
} from "@/lib/context-entry";
import { prisma } from "@/lib/prisma";
import { readAuthenticatedUserIdentity } from "@/lib/user-session";

const updateProfileSchema = z
  .object({
    displayName: z.string(),
  })
  .strict();

function identityFailureRedirect(reason: string): never {
  if (reason === "NOT_USER") {
    redirect("/");
  }
  redirect("/login");
}

export async function updateOwnDisplayNameAction(
  _previous: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const identity = await readAuthenticatedUserIdentity();
  if (!identity.ok) {
    identityFailureRedirect(identity.reason);
  }

  if (
    formData.has("email") ||
    formData.has("userId") ||
    formData.has("facilityId") ||
    formData.has("employeeId")
  ) {
    return {
      status: "error",
      message: "Invalid profile update.",
      workspaceLost: false,
    };
  }

  const parsed = updateProfileSchema.safeParse({
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter a display name.",
      workspaceLost: false,
    };
  }

  const updated = await updateOwnDisplayName(prisma, {
    userId: identity.identity.uid,
    displayName: parsed.data.displayName,
  });
  if (!updated.ok) {
    return { status: "error", message: updated.message, workspaceLost: false };
  }

  let reminted;
  try {
    reminted = await remintCurrentUserSession(prisma, {
      session: identity.identity.session,
    });
  } catch (error) {
    if (
      error instanceof ContextEntryError &&
      (error.code === "USER_NOT_FOUND" ||
        error.code === "USER_INACTIVE" ||
        error.code === "SESSION_VERSION_STALE")
    ) {
      redirect("/login");
    }
    throw error;
  }

  const jar = await cookies();
  await applyRemintedUserSessionCookies(prisma, jar, reminted, identity.identity.session);

  return {
    status: "success",
    message: "Profile updated.",
    workspaceLost: reminted.fallbackToAccount,
  };
}

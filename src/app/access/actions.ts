"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  applyAccountSessionCookies,
  applyContextTransitionCookies,
  ContextEntryError,
  enterAccountContext,
  enterContext,
} from "@/lib/context-entry";
import { resolveDepartmentCarryoverForFacilitySwitch } from "@/lib/facility-access/switch-active-facility";
import { ACTIVE_DEPARTMENT_COOKIE } from "@/lib/department-nav";
import { PARTNER_ACTIVE_DEPARTMENT_COOKIE } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";
import { readAuthenticatedUserIdentity } from "@/lib/user-session";

function identityFailureRedirect(reason: string): never {
  if (reason === "NOT_USER") {
    redirect("/");
  }
  redirect("/login");
}

function contextEntryFailureRedirect(error: ContextEntryError): never {
  if (
    error.code === "USER_NOT_FOUND" ||
    error.code === "USER_INACTIVE" ||
    error.code === "SESSION_VERSION_STALE"
  ) {
    redirect("/login");
  }
  redirect(`/access?error=${error.code}`);
}

export async function enterAccountContextAction(): Promise<void> {
  const identity = await readAuthenticatedUserIdentity();
  if (!identity.ok) {
    identityFailureRedirect(identity.reason);
  }

  let result;
  try {
    result = await enterAccountContext(prisma, {
      userId: identity.identity.uid,
      sessionVersion: identity.identity.sessionVersion,
    });
  } catch (error) {
    if (error instanceof ContextEntryError) {
      contextEntryFailureRedirect(error);
    }
    throw error;
  }

  const jar = await cookies();
  applyAccountSessionCookies(jar, result.token);
  redirect(result.redirectPath);
}

export async function enterContextAction(formData: FormData): Promise<void> {
  const contextKey = String(formData.get("contextKey") ?? "");
  const identity = await readAuthenticatedUserIdentity();
  if (!identity.ok) {
    identityFailureRedirect(identity.reason);
  }

  let result;
  try {
    result = await enterContext(prisma, {
      userId: identity.identity.uid,
      contextKey,
      sessionVersion: identity.identity.sessionVersion,
    });
  } catch (error) {
    if (error instanceof ContextEntryError) {
      contextEntryFailureRedirect(error);
    }
    throw error;
  }

  const jar = await cookies();
  const source = identity.identity.session;
  let internalDepartmentCarryover: string | null = null;
  if (
    result.kind === "facility_internal" &&
    result.facilityId &&
    source.scopeKind === "facility" &&
    source.accessKind !== "partner" &&
    source.authKind === "user"
  ) {
    const carry = await resolveDepartmentCarryoverForFacilitySwitch(prisma, {
      destinationFacilityId: result.facilityId,
      sourceDepartmentId: jar.get(ACTIVE_DEPARTMENT_COOKIE)?.value ?? source.primaryDepartmentId,
    });
    internalDepartmentCarryover = carry.departmentCookieValue;
  }

  applyContextTransitionCookies(
    jar,
    {
      kind: result.kind,
      token: result.token,
      facilityId: result.facilityId,
      facilityPartnerOrganizationId: result.facilityPartnerOrganizationId,
      allowedDepartmentIds: result.allowedDepartmentIds,
    },
    {
      session: source,
      internalDepartmentId: jar.get(ACTIVE_DEPARTMENT_COOKIE)?.value,
      partnerDepartmentId: jar.get(PARTNER_ACTIVE_DEPARTMENT_COOKIE)?.value,
      internalDepartmentCarryover,
    },
  );
  redirect(result.redirectPath);
}

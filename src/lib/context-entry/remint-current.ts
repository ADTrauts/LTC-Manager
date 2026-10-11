import type { Prisma, PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { currentContextKeyFromSession } from "@/lib/available-contexts";
import { ACTIVE_DEPARTMENT_COOKIE } from "@/lib/department-nav";
import { resolveDepartmentCarryoverForFacilitySwitch } from "@/lib/facility-access/switch-active-facility";
import { PARTNER_ACTIVE_DEPARTMENT_COOKIE } from "@/lib/partner-operational-context";

import {
  applyAccountSessionCookies,
  applyContextTransitionCookies,
  type CookieWriter,
} from "./cookies";
import { enterAccountContext, enterContext } from "./enter";
import { ContextEntryError, type ContextKeyKind, type EnterContextResult } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type RemintCurrentUserSessionResult = {
  token: string;
  kind: ContextKeyKind | "account";
  fallbackToAccount: boolean;
  facilityId?: string;
  facilityPartnerOrganizationId?: string;
  allowedDepartmentIds?: string[];
};

export type RemintCurrentUserSessionDeps = {
  enterContext?: typeof enterContext;
  enterAccountContext?: typeof enterAccountContext;
};

/**
 * Re-mint the current User JWT with live identity presentation.
 * Preserves the selected workspace when that relationship is still valid.
 * Does not list available contexts and does not increment sessionVersion.
 */
export async function remintCurrentUserSession(
  db: DbClient,
  input: { session: AppJwtPayload; now?: Date },
  deps: RemintCurrentUserSessionDeps = {},
): Promise<RemintCurrentUserSessionResult> {
  if (input.session.authKind !== "user") {
    throw new ContextEntryError("USER_INACTIVE", "User is inactive.");
  }

  const enter = deps.enterContext ?? enterContext;
  const enterAccount = deps.enterAccountContext ?? enterAccountContext;
  const contextKey = currentContextKeyFromSession(input.session);

  if (!contextKey) {
    const minted = await enterAccount(db, {
      userId: input.session.uid,
      sessionVersion: input.session.sessionVersion,
    });
    return { token: minted.token, kind: "account", fallbackToAccount: false };
  }

  try {
    const entered = await enter(db, {
      userId: input.session.uid,
      contextKey,
      now: input.now,
      sessionVersion: input.session.sessionVersion,
    });
    return toWorkspaceResult(entered, false);
  } catch (error) {
    if (error instanceof ContextEntryError && error.code === "CONTEXT_NOT_AVAILABLE") {
      const minted = await enterAccount(db, {
        userId: input.session.uid,
        sessionVersion: input.session.sessionVersion,
      });
      return { token: minted.token, kind: "account", fallbackToAccount: true };
    }
    throw error;
  }
}

function toWorkspaceResult(
  entered: EnterContextResult,
  fallbackToAccount: boolean,
): RemintCurrentUserSessionResult {
  return {
    token: entered.token,
    kind: entered.kind,
    fallbackToAccount,
    facilityId: entered.facilityId,
    facilityPartnerOrganizationId: entered.facilityPartnerOrganizationId,
    allowedDepartmentIds: entered.allowedDepartmentIds,
  };
}

export async function applyRemintedUserSessionCookies(
  db: DbClient,
  jar: CookieWriter & { get: (name: string) => { value: string } | undefined },
  result: RemintCurrentUserSessionResult,
  source: AppJwtPayload,
): Promise<void> {
  if (result.kind === "account") {
    applyAccountSessionCookies(jar, result.token);
    return;
  }

  let internalDepartmentCarryover: string | null = null;
  if (
    result.kind === "facility_internal" &&
    result.facilityId &&
    source.scopeKind === "facility" &&
    source.accessKind !== "partner" &&
    source.authKind === "user"
  ) {
    const carry = await resolveDepartmentCarryoverForFacilitySwitch(db, {
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
}

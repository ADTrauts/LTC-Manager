import type { Prisma, PrismaClient } from "@prisma/client";

import {
  ContextEntryError,
  enterAccountContext,
  enterContext,
} from "@/lib/context-entry";

import { PostAuthRoutingError, type AuthenticatedUserLanding } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type EnterGrantedContextInput = {
  userId: string;
  contextKey: string;
  sessionVersion?: number;
  now?: Date;
};

export type EnterGrantedContextDeps = {
  enterContext?: typeof enterContext;
  enterAccountContext?: typeof enterAccountContext;
};

function rethrowIdentityFailure(error: unknown): never {
  if (
    error instanceof ContextEntryError &&
    (error.code === "USER_NOT_FOUND" ||
      error.code === "USER_INACTIVE" ||
      error.code === "SESSION_VERSION_STALE")
  ) {
    throw new PostAuthRoutingError(error.code, error.message);
  }
  throw error;
}

/**
 * Enter one explicit granted context. Does not list available contexts.
 * Missing live relationship recovers to an account session; identity failure does not.
 */
export async function enterGrantedContext(
  db: DbClient,
  input: EnterGrantedContextInput,
  deps: EnterGrantedContextDeps = {},
): Promise<AuthenticatedUserLanding> {
  const enter = deps.enterContext ?? enterContext;
  const enterAccount = deps.enterAccountContext ?? enterAccountContext;

  try {
    const entered = await enter(db, {
      userId: input.userId,
      contextKey: input.contextKey,
      now: input.now,
      sessionVersion: input.sessionVersion,
    });
    return {
      kind: "context",
      token: entered.token,
      redirectPath: entered.redirectPath,
      contextCount: 1,
      contextKey: input.contextKey,
      destinationKind: entered.kind,
      organizationId: entered.organizationId,
      facilityId: entered.facilityId,
      partnerOrganizationId: entered.partnerOrganizationId,
      facilityPartnerOrganizationId: entered.facilityPartnerOrganizationId,
      role: entered.role,
      allowedDepartmentIds: entered.allowedDepartmentIds,
    };
  } catch (error) {
    if (error instanceof ContextEntryError && error.code === "CONTEXT_NOT_AVAILABLE") {
      try {
        const minted = await enterAccount(db, {
          userId: input.userId,
          sessionVersion: input.sessionVersion,
        });
        return {
          kind: "account",
          token: minted.token,
          redirectPath: "/access",
          contextCount: 0,
          fallbackToAccount: true,
        };
      } catch (accountError) {
        rethrowIdentityFailure(accountError);
      }
    }
    rethrowIdentityFailure(error);
  }
}

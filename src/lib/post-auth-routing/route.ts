import type { Prisma, PrismaClient } from "@prisma/client";

import {
  listAvailableContexts,
  AvailableContextError,
  type AvailableContext,
} from "@/lib/available-contexts";
import {
  ContextEntryError,
  enterAccountContext,
  enterContext,
  type EnterAccountContextResult,
  type EnterContextResult,
} from "@/lib/context-entry";

import {
  PostAuthRoutingError,
  type AuthenticatedUserLanding,
  type RouteAuthenticatedUserInput,
} from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type RouteAuthenticatedUserDeps = {
  listAvailableContexts?: typeof listAvailableContexts;
  enterContext?: typeof enterContext;
  enterAccountContext?: typeof enterAccountContext;
};

function rethrowIdentityFailure(error: unknown): never {
  if (error instanceof AvailableContextError) {
    throw new PostAuthRoutingError(error.code, error.message);
  }
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

function toContextLanding(
  contextKey: string,
  entered: EnterContextResult,
): AuthenticatedUserLanding {
  return {
    kind: "context",
    token: entered.token,
    redirectPath: entered.redirectPath,
    contextCount: 1,
    contextKey,
    destinationKind: entered.kind,
    organizationId: entered.organizationId,
    facilityId: entered.facilityId,
    partnerOrganizationId: entered.partnerOrganizationId,
    facilityPartnerOrganizationId: entered.facilityPartnerOrganizationId,
    role: entered.role,
    allowedDepartmentIds: entered.allowedDepartmentIds,
  };
}

function toAccountLanding(
  minted: EnterAccountContextResult,
  contextCount: number,
): AuthenticatedUserLanding {
  return {
    kind: "account",
    token: minted.token,
    redirectPath: "/access",
    contextCount,
  };
}

async function mintAccountLanding(
  db: DbClient,
  input: RouteAuthenticatedUserInput,
  contextCount: number,
  enterAccount: typeof enterAccountContext,
): Promise<AuthenticatedUserLanding> {
  try {
    const minted = await enterAccount(db, {
      userId: input.userId,
      sessionVersion: input.sessionVersion,
    });
    return toAccountLanding(minted, contextCount);
  } catch (error) {
    rethrowIdentityFailure(error);
  }
}

/**
 * After password authentication, land the User from live available contexts.
 * Does not authenticate, query grants/memberships/assignments itself, or pick a preference.
 */
export async function routeAuthenticatedUser(
  db: DbClient,
  input: RouteAuthenticatedUserInput,
  deps: RouteAuthenticatedUserDeps = {},
): Promise<AuthenticatedUserLanding> {
  const list = deps.listAvailableContexts ?? listAvailableContexts;
  const enter = deps.enterContext ?? enterContext;
  const enterAccount = deps.enterAccountContext ?? enterAccountContext;

  let contexts: AvailableContext[];
  try {
    contexts = await list(db, { userId: input.userId, now: input.now });
  } catch (error) {
    rethrowIdentityFailure(error);
  }

  if (contexts.length === 0) {
    return mintAccountLanding(db, input, 0, enterAccount);
  }

  if (contexts.length === 1) {
    const contextKey = contexts[0]!.contextKey;
    try {
      const entered = await enter(db, {
        userId: input.userId,
        contextKey,
        now: input.now,
        sessionVersion: input.sessionVersion,
      });
      return toContextLanding(contextKey, entered);
    } catch (error) {
      if (error instanceof ContextEntryError && error.code === "CONTEXT_NOT_AVAILABLE") {
        return mintAccountLanding(db, input, 0, enterAccount);
      }
      rethrowIdentityFailure(error);
    }
  }

  return mintAccountLanding(db, input, contexts.length, enterAccount);
}

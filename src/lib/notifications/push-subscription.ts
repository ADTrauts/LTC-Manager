import { Prisma, type PrismaClient } from "@prisma/client";

import { capPushAuthorizationUntil } from "@/lib/notifications/push-authorization";

/**
 * Personal browser push endpoints.
 * This module stores and revokes subscriptions. It does not send Web Push.
 */

const ENDPOINT_MAX = 2048;
const KEY_MAX = 200;

export class PushSubscriptionError extends Error {
  readonly code: "INVALID" | "DENIED";

  constructor(code: "INVALID" | "DENIED") {
    super(code === "INVALID" ? "Invalid subscription." : "Browser alerts are not available for this session.");
    this.name = "PushSubscriptionError";
    this.code = code;
  }
}

type PushSubscriptionWriter = {
  pushSubscription: {
    updateMany: (args: Prisma.PushSubscriptionUpdateManyArgs) => Promise<{ count: number }>;
  };
};

type RegisterInput = {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  now: Date;
  /** Taken from the authenticated session. The client does not supply this. */
  authorizedSessionVersion: number;
  /** Session expiry observed by the server, capped at the session lifetime. */
  authorizedUntil: Date;
};

function authorizationWrite(input: RegisterInput, authorizedUntil: Date) {
  return {
    authorizedSessionVersion: input.authorizedSessionVersion,
    authorizedUntil,
  };
}

export async function registerPushSubscription(
  db: PrismaClient,
  input: RegisterInput,
): Promise<{ state: "enabled" }> {
  const endpoint = requireEndpoint(input.endpoint);
  const p256dh = requireKey(input.p256dh);
  const auth = requireKey(input.auth);
  const authorizedUntil = requireAuthorization(input);
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, isActive: true },
  });
  if (!user?.isActive) throw new PushSubscriptionError("DENIED");

  const write = () =>
    db.$transaction(async (tx) => {
      const active = await tx.pushSubscription.findFirst({
        where: { endpoint, revokedAt: null },
        select: { id: true, userId: true },
      });
      if (active?.userId === input.userId) {
        await tx.pushSubscription.update({
          where: { id: active.id },
          data: { p256dh, auth, lastSeenAt: input.now, ...authorizationWrite(input, authorizedUntil) },
        });
        return;
      }
      if (active) {
        await tx.pushSubscription.update({
          where: { id: active.id },
          data: { revokedAt: input.now, revokedReason: "REPLACED" },
        });
      }
      const prior = await tx.pushSubscription.findFirst({
        where: { endpoint, userId: input.userId, revokedAt: { not: null } },
        orderBy: { revokedAt: "desc" },
        select: { id: true },
      });
      if (prior) {
        await tx.pushSubscription.update({
          where: { id: prior.id },
          data: {
            p256dh,
            auth,
            lastSeenAt: input.now,
            revokedAt: null,
            revokedReason: null,
            ...authorizationWrite(input, authorizedUntil),
          },
        });
        return;
      }
      await tx.pushSubscription.create({
        data: {
          userId: input.userId,
          endpoint,
          p256dh,
          auth,
          lastSeenAt: input.now,
          ...authorizationWrite(input, authorizedUntil),
        },
      });
    });

  try {
    await write();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      try {
        await write();
      } catch (retryError) {
        if (
          retryError instanceof Prisma.PrismaClientKnownRequestError &&
          (retryError.code === "P2002" || retryError.code === "P2003")
        ) {
          throw new PushSubscriptionError("DENIED");
        }
        throw retryError;
      }
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new PushSubscriptionError("DENIED");
    } else {
      throw error;
    }
  }
  return { state: "enabled" };
}

export async function disablePushSubscription(
  db: PrismaClient,
  input: { userId: string; endpoint: string; now: Date },
): Promise<{ state: "not_enabled"; serverRevoked: boolean }> {
  const endpoint = requireEndpoint(input.endpoint);
  const result = await db.pushSubscription.updateMany({
    where: { userId: input.userId, endpoint, revokedAt: null },
    data: { revokedAt: input.now, revokedReason: "USER_DISABLED" },
  });
  return { state: "not_enabled", serverRevoked: result.count > 0 };
}

/**
 * Drops this User's active row for an endpoint they own.
 * Another User's endpoint is left alone.
 */
export async function releasePushEndpoint(
  db: PrismaClient,
  input: { userId: string; endpoint: string; now: Date },
): Promise<{ released: number }> {
  const endpoint = optionalEndpoint(input.endpoint);
  if (!endpoint || !input.userId) return { released: 0 };
  const result = await db.pushSubscription.updateMany({
    where: { userId: input.userId, endpoint, revokedAt: null },
    data: { revokedAt: input.now, revokedReason: "LOGOUT" },
  });
  return { released: result.count };
}

/** Protocol or endpoint rejection for one row. Does not revoke that User's other devices. */
export async function revokePushSubscriptionReason(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    subscriptionId: string;
    userId: string;
    reason: "GONE" | "UNAUTHORIZED";
    now: Date;
  },
): Promise<void> {
  await db.pushSubscription.updateMany({
    where: { id: input.subscriptionId, userId: input.userId, revokedAt: null },
    data: { revokedAt: input.now, revokedReason: input.reason },
  });
}

export async function revokeAllPushSubscriptionsForUser(
  db: PushSubscriptionWriter,
  input: { userId: string; now: Date },
): Promise<void> {
  if (typeof db.pushSubscription?.updateMany !== "function") return;
  await db.pushSubscription.updateMany({
    where: { userId: input.userId, revokedAt: null },
    data: { revokedAt: input.now, revokedReason: "LOGOUT" },
  });
}

/** Successful User logout. The browser endpoint is not required and is not consulted. */
export async function revokeAuthenticatedUserPush(
  db: PushSubscriptionWriter,
  session: { authKind?: string | null; uid?: string | null } | null,
  now: Date,
): Promise<"revoked" | "skipped"> {
  if (!session || session.authKind !== "user" || !session.uid) return "skipped";
  await revokeAllPushSubscriptionsForUser(db, { userId: session.uid, now });
  return "revoked";
}

/**
 * A full User session is about to be replaced by a different User, Quick PIN, or Harbor.
 * The same User signing in again does not revoke their other browsers.
 */
export async function revokePushForDepartingUser(
  db: PushSubscriptionWriter,
  previous: { authKind?: string | null; uid?: string | null } | null,
  nextUserId: string | null,
  now: Date,
): Promise<void> {
  if (!previous || previous.authKind !== "user" || !previous.uid) return;
  if (nextUserId && previous.uid === nextUserId) return;
  await revokeAllPushSubscriptionsForUser(db, { userId: previous.uid, now });
}

/**
 * Keep the browser subscription only when this User already owns an authorized row.
 * An authenticated different User presenting this endpoint revokes that holder.
 * Quick PIN and Harbor do not revoke by endpoint. A historical row with no lease stays ineligible.
 */
export async function reconcilePushEndpoint(
  db: PrismaClient,
  input: {
    endpoint: string;
    userId: string | null;
    now: Date;
    sessionExpiresAt?: Date | null;
    authorizedSessionVersion?: number | null;
  },
): Promise<{ keep: boolean }> {
  const endpoint = optionalEndpoint(input.endpoint);
  if (!endpoint) return { keep: false };
  const active = await db.pushSubscription.findFirst({
    where: { endpoint, revokedAt: null },
    select: { id: true, userId: true, authorizedUntil: true },
  });
  if (!active) return { keep: false };
  if (!input.userId) return { keep: false };
  if (active.userId !== input.userId) {
    await db.pushSubscription.update({
      where: { id: active.id },
      data: { revokedAt: input.now, revokedReason: "LOGOUT" },
    });
    return { keep: false };
  }
  if (!active.authorizedUntil) return { keep: false };
  const renewed = input.sessionExpiresAt ? capPushAuthorizationUntil(input.now, input.sessionExpiresAt) : null;
  if (renewed && input.authorizedSessionVersion != null) {
    await db.pushSubscription.update({
      where: { id: active.id },
      data: {
        lastSeenAt: input.now,
        authorizedUntil: renewed,
        authorizedSessionVersion: input.authorizedSessionVersion,
      },
    });
    return { keep: true };
  }
  if (active.authorizedUntil.getTime() <= input.now.getTime()) return { keep: false };
  return { keep: true };
}

export async function pushSubscriptionStatus(
  db: PrismaClient,
  input: { userId: string; endpoint: string; now: Date },
): Promise<{ state: "enabled" | "not_enabled" }> {
  const endpoint = optionalEndpoint(input.endpoint);
  if (!endpoint) return { state: "not_enabled" };
  const active = await db.pushSubscription.findFirst({
    where: { endpoint, userId: input.userId, revokedAt: null },
    select: { authorizedUntil: true },
  });
  if (!active?.authorizedUntil || active.authorizedUntil.getTime() <= input.now.getTime()) {
    return { state: "not_enabled" };
  }
  return { state: "enabled" };
}

function requireAuthorization(input: RegisterInput): Date {
  if (
    !Number.isInteger(input.authorizedSessionVersion) ||
    input.authorizedSessionVersion < 0 ||
    input.authorizedSessionVersion > 1_000_000
  ) {
    throw new PushSubscriptionError("DENIED");
  }
  const authorizedUntil = capPushAuthorizationUntil(input.now, input.authorizedUntil);
  if (!authorizedUntil) throw new PushSubscriptionError("DENIED");
  return authorizedUntil;
}

function requireEndpoint(value: string): string {
  const endpoint = optionalEndpoint(value);
  if (!endpoint) throw new PushSubscriptionError("INVALID");
  return endpoint;
}

function optionalEndpoint(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 12 || trimmed.length > ENDPOINT_MAX) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  return trimmed;
}

function requireKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 16 || trimmed.length > KEY_MAX || !/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw new PushSubscriptionError("INVALID");
  }
  return trimmed;
}

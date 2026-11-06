-- Personal browser push endpoints. One active endpoint has one User owner.
-- Revoked rows may keep the same endpoint. Facility is not a column.
-- No backfill. N5A does not send push.

CREATE TYPE "PushSubscriptionRevocationReason" AS ENUM ('LOGOUT', 'REPLACED', 'GONE', 'UNAUTHORIZED', 'USER_DISABLED');

CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" "PushSubscriptionRevocationReason",

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_active_endpoint_key" ON "PushSubscription"("endpoint") WHERE "revokedAt" IS NULL;

CREATE INDEX "PushSubscription_userId_revokedAt_idx" ON "PushSubscription"("userId", "revokedAt");

CREATE INDEX "PushSubscription_endpoint_idx" ON "PushSubscription"("endpoint");

ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

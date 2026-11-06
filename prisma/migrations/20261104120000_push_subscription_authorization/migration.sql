-- Personal Web Push authorization lease.
-- Null means the row was never authorized under this model. No backfill.

ALTER TABLE "PushSubscription" ADD COLUMN "authorizedSessionVersion" INTEGER;
ALTER TABLE "PushSubscription" ADD COLUMN "authorizedUntil" TIMESTAMP(3);

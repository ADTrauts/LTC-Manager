-- Per User and Facility interruption preferences.
-- Quiet and digest do not hide the Notification Center or change the bell.
-- No backfill. A missing row means quiet is off and Update digest is not selected.

CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "quietEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietStartMinute" INTEGER,
    "quietEndMinute" INTEGER,
    "updateDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreference_userId_facilityId_key" ON "NotificationPreference"("userId", "facilityId");

CREATE INDEX "NotificationPreference_facilityId_idx" ON "NotificationPreference"("facilityId");

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

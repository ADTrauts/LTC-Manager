-- Coverage episode history. The Coverage answer stays derived.
-- Close reasons are episode facts, not Coverage states.

CREATE TYPE "CoverageEpisodeCloseReason" AS ENUM ('RESTORED', 'SERVICE_WINDOW_ENDED', 'REQUIREMENT_REMOVED');

CREATE TABLE "CoverageEpisode" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "spaceId" TEXT NOT NULL,
    "responsibility" TEXT NOT NULL,
    "cycleStableKey" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closeReason" "CoverageEpisodeCloseReason",
    "openingState" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverageEpisode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoverageEpisodeTransition" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageEpisodeTransition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoverageEpisode_date_idx" ON "CoverageEpisode"("facilityId", "serviceDate", "departmentId");

CREATE INDEX "CoverageEpisode_grain_idx" ON "CoverageEpisode"("facilityId", "departmentId", "spaceId", "responsibility", "cycleStableKey");

CREATE UNIQUE INDEX "CoverageEpisode_one_open_grain" ON "CoverageEpisode"("facilityId", "serviceDate", "departmentId", "spaceId", "responsibility", "cycleStableKey") WHERE "closedAt" IS NULL;

CREATE UNIQUE INDEX "CoverageEpisodeTransition_facilityId_dedupeKey_key" ON "CoverageEpisodeTransition"("facilityId", "dedupeKey");

CREATE INDEX "CoverageEpisodeTransition_episodeId_occurredAt_idx" ON "CoverageEpisodeTransition"("episodeId", "occurredAt");

ALTER TABLE "CoverageEpisode" ADD CONSTRAINT "CoverageEpisode_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CoverageEpisode" ADD CONSTRAINT "CoverageEpisode_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CoverageEpisodeTransition" ADD CONSTRAINT "CoverageEpisodeTransition_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "CoverageEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

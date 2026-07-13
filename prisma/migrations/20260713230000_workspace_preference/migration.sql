-- Wave 12 M3: per-user, per-facility Business Workspace preferences.

CREATE TABLE "WorkspacePreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "hiddenSectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "collapsedSectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sectionOrder" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredLandingSectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspacePreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspacePreference_userId_facilityId_key" ON "WorkspacePreference"("userId", "facilityId");
CREATE INDEX "WorkspacePreference_userId_idx" ON "WorkspacePreference"("userId");
CREATE INDEX "WorkspacePreference_facilityId_idx" ON "WorkspacePreference"("facilityId");

ALTER TABLE "WorkspacePreference" ADD CONSTRAINT "WorkspacePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspacePreference" ADD CONSTRAINT "WorkspacePreference_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DSH-05: a facility's starting Dashboard for one authority band and scope. Additive only.

CREATE TYPE "DashboardAuthority" AS ENUM ('FACILITY_ADMINISTRATOR', 'DEPARTMENT_LEADER', 'MANAGER', 'SUPERVISOR');

CREATE TABLE "DashboardFacilityDefault" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "authority" "DashboardAuthority" NOT NULL,
    "scopeKind" "DashboardScopeKind" NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardFacilityDefault_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DashboardFacilityDefault_facilityId_idx" ON "DashboardFacilityDefault"("facilityId");

CREATE UNIQUE INDEX "DashboardFacilityDefault_facilityId_authority_scopeKind_key" ON "DashboardFacilityDefault"("facilityId", "authority", "scopeKind");

ALTER TABLE "DashboardFacilityDefault" ADD CONSTRAINT "DashboardFacilityDefault_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

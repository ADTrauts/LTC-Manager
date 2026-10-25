-- DSH-03: a person's Dashboard arrangement. Additive only.

CREATE TYPE "DashboardScopeKind" AS ENUM ('FACILITY', 'DEPARTMENT', 'TEAM');

CREATE TABLE "DashboardLayout" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "userId" TEXT,
    "employeeId" TEXT,
    "scopeKind" "DashboardScopeKind" NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardLayout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DashboardLayout_facilityId_idx" ON "DashboardLayout"("facilityId");

CREATE UNIQUE INDEX "DashboardLayout_facilityId_userId_scopeKind_key" ON "DashboardLayout"("facilityId", "userId", "scopeKind");

CREATE UNIQUE INDEX "DashboardLayout_facilityId_employeeId_scopeKind_key" ON "DashboardLayout"("facilityId", "employeeId", "scopeKind");

ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_one_owner_check" CHECK (num_nonnulls("userId", "employeeId") = 1);

ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

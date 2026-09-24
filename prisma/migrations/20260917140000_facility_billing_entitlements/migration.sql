-- Commercial foundation (ADL-013). Existing facilities have no rows and stay unmanaged.
-- Entitlement is not enforced until BILLING_ENTITLEMENTS_ENABLED is on.

CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');

CREATE TYPE "BillingSetupPath" AS ENUM ('SELF_SERVE', 'ASSISTED');

CREATE TYPE "FacilityBillingStatus" AS ENUM (
  'UNMANAGED',
  'INCOMPLETE',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED'
);

CREATE TYPE "DepartmentEntitlementStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "FacilityBilling" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "status" "FacilityBillingStatus" NOT NULL DEFAULT 'UNMANAGED',
  "interval" "BillingInterval" NOT NULL DEFAULT 'ANNUAL',
  "setupPath" "BillingSetupPath" NOT NULL DEFAULT 'SELF_SERVE',
  "stripeSubscriptionId" TEXT,
  "licensedDepartmentCount" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FacilityBilling_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacilityBilling_facilityId_key" ON "FacilityBilling"("facilityId");
CREATE INDEX "FacilityBilling_status_idx" ON "FacilityBilling"("status");

ALTER TABLE "FacilityBilling"
  ADD CONSTRAINT "FacilityBilling_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FacilityDepartmentEntitlement" (
  "id" TEXT NOT NULL,
  "facilityBillingId" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "departmentKey" TEXT NOT NULL,
  "departmentId" TEXT,
  "status" "DepartmentEntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "stripeSubscriptionItemId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FacilityDepartmentEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacilityDepartmentEntitlement_facilityBillingId_departmentKey_key"
  ON "FacilityDepartmentEntitlement"("facilityBillingId", "departmentKey");
CREATE INDEX "FacilityDepartmentEntitlement_facilityId_status_idx"
  ON "FacilityDepartmentEntitlement"("facilityId", "status");
CREATE INDEX "FacilityDepartmentEntitlement_departmentId_idx"
  ON "FacilityDepartmentEntitlement"("departmentId");

ALTER TABLE "FacilityDepartmentEntitlement"
  ADD CONSTRAINT "FacilityDepartmentEntitlement_facilityBillingId_fkey"
  FOREIGN KEY ("facilityBillingId") REFERENCES "FacilityBilling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FacilityDepartmentEntitlement"
  ADD CONSTRAINT "FacilityDepartmentEntitlement_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FacilityDepartmentEntitlement"
  ADD CONSTRAINT "FacilityDepartmentEntitlement_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

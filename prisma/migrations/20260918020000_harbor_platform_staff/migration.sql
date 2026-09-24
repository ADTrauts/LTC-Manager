-- Harbor Console staff identity. Separate from facility User / RoleKey.

CREATE TYPE "PlatformStaffRole" AS ENUM ('OWNER', 'MEMBER');

CREATE TYPE "HarborAuditAction" AS ENUM ('LOGIN', 'VIEW_CUSTOMER');

CREATE TABLE "PlatformStaff" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "PlatformStaffRole" NOT NULL DEFAULT 'MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformStaff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformStaff_email_key" ON "PlatformStaff"("email");

CREATE TABLE "HarborAuditEvent" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "action" "HarborAuditAction" NOT NULL,
    "facilityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HarborAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HarborAuditEvent_staffId_createdAt_idx" ON "HarborAuditEvent"("staffId", "createdAt");
CREATE INDEX "HarborAuditEvent_facilityId_createdAt_idx" ON "HarborAuditEvent"("facilityId", "createdAt");

ALTER TABLE "HarborAuditEvent"
  ADD CONSTRAINT "HarborAuditEvent_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "PlatformStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

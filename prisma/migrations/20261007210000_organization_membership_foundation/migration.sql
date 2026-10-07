-- Phase 2B1: Organization membership foundation.
-- User.facilityId / User.roleId become nullable (home Facility + Facility RoleKey).
-- Additive membership tables. No backfill. Does not grant Facility access.

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "facilityId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "roleId" DROP NOT NULL;

-- CreateEnum
CREATE TYPE "OrganizationMembershipRole" AS ENUM ('ORG_ADMIN', 'ORG_MEMBER');

-- CreateTable
CREATE TABLE "UserOrganizationMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOrganizationRolePeriod" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "role" "OrganizationMembershipRole" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOrganizationRolePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserOrganizationMembership_userId_organizationId_key" ON "UserOrganizationMembership"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "UserOrganizationMembership_organizationId_idx" ON "UserOrganizationMembership"("organizationId");

-- CreateIndex
CREATE INDEX "UserOrganizationMembership_userId_idx" ON "UserOrganizationMembership"("userId");

-- CreateIndex
CREATE INDEX "UserOrganizationMembership_createdByUserId_idx" ON "UserOrganizationMembership"("createdByUserId");

-- CreateIndex
CREATE INDEX "UserOrgRolePeriod_membership_startsAt_idx" ON "UserOrganizationRolePeriod"("membershipId", "startsAt");

-- CreateIndex
CREATE INDEX "UserOrgRolePeriod_membership_endsAt_idx" ON "UserOrganizationRolePeriod"("membershipId", "endsAt");

-- CreateIndex
CREATE INDEX "UserOrganizationRolePeriod_createdByUserId_idx" ON "UserOrganizationRolePeriod"("createdByUserId");

-- CreateIndex
CREATE INDEX "UserOrganizationRolePeriod_endedByUserId_idx" ON "UserOrganizationRolePeriod"("endedByUserId");

-- AddForeignKey
ALTER TABLE "UserOrganizationMembership" ADD CONSTRAINT "UserOrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationMembership" ADD CONSTRAINT "UserOrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationMembership" ADD CONSTRAINT "UserOrganizationMembership_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationRolePeriod" ADD CONSTRAINT "UserOrganizationRolePeriod_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "UserOrganizationMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationRolePeriod" ADD CONSTRAINT "UserOrganizationRolePeriod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationRolePeriod" ADD CONSTRAINT "UserOrganizationRolePeriod_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

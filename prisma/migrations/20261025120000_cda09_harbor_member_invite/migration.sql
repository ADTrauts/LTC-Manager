-- CDA-09: Vssyl Console can invite a company member before an Organization Administrator exists.
ALTER TABLE "OrganizationMemberInvitation" ALTER COLUMN "invitedByUserId" DROP NOT NULL;

ALTER TABLE "OrganizationMemberInvitation" ADD COLUMN "invitedByPlatformStaffId" TEXT;

ALTER TABLE "OrganizationMemberInvitation"
  ADD CONSTRAINT "OrganizationMemberInvitation_invitedByPlatformStaffId_fkey"
  FOREIGN KEY ("invitedByPlatformStaffId") REFERENCES "PlatformStaff"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OrganizationMemberInvitation_invitedByPlatformStaffId_idx"
  ON "OrganizationMemberInvitation"("invitedByPlatformStaffId");

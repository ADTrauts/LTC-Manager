import { EmployeeStatus, Prisma, RoleKey, type PrismaClient } from "@prisma/client";

import { organizationDisplayLabel } from "@/lib/organization-membership/types";

import { isHarborOwnerSession, validateHarborStaffSession, type HarborJwtPayload } from "./auth";
import { HARBOR_CUSTOMER_PAGE_SIZE, harborCustomerPageWindow } from "./pagination";

type InvitationFollowUpRecord = {
  facilityId: string;
  facilityName: string;
  organizationName: string;
  organizationDisplayName: string | null;
  invitationState: "missing" | "expired";
};

function matchingFacilities(now: Date) {
  // The one-open-Administrator trigger gives each Facility at most one candidate.
  // Match the seat reader's account, access and Facility-specific employment checks before paginating.
  // Prisma stores invite timestamps as UTC values without a zone.
  const utcCutoff = Prisma.sql`(${now}::timestamptz AT TIME ZONE 'UTC')`;
  return Prisma.sql`
    FROM "UserFacilityRolePeriod" period
    JOIN "UserFacilityAccess" access ON access."id" = period."userFacilityAccessId"
    JOIN "Facility" facility ON facility."id" = access."facilityId"
    JOIN "Organization" organization ON organization."id" = facility."organizationId"
    JOIN "User" holder ON holder."id" = access."userId"
    LEFT JOIN LATERAL (
      SELECT token."expiresAt" FROM "AccountInviteToken" token
      WHERE token."userId" = holder."id" AND token."usedAt" IS NULL
      ORDER BY token."expiresAt" DESC LIMIT 1
    ) latest_unused ON TRUE
    WHERE period."roleKey" = ${RoleKey.FACILITY_ADMINISTRATOR}::"RoleKey"
      AND period."endsAt" IS NULL
      AND access."isActive" AND access."revokedAt" IS NULL
      AND holder."isActive" AND holder."passwordHash" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Employee" employee
        WHERE employee."facilityId" = facility."id" AND employee."userId" = holder."id"
          AND employee."status" = ${EmployeeStatus.TERMINATED}::"EmployeeStatus"
      )
      AND (latest_unused."expiresAt" IS NULL OR latest_unused."expiresAt" <= ${utcCutoff})
  `;
}

export async function loadHarborAdministratorInvitationFollowUp(
  db: PrismaClient,
  session: HarborJwtPayload | null,
  rawPage?: string | string[],
  now = new Date(),
) {
  if (!session || !isHarborOwnerSession(session)) return null;

  return db.$transaction(async (tx) => {
    const authority = await validateHarborStaffSession(session, tx);
    if (!authority.valid || authority.staff.role !== "OWNER") return null;

    const matches = matchingFacilities(now);
    const [count] = await tx.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total ${matches}`;
    const total = Number(count?.total ?? 0);
    const window = harborCustomerPageWindow(total, rawPage);
    const records = total ? await tx.$queryRaw<InvitationFollowUpRecord[]>`
      SELECT facility."id" AS "facilityId", facility."displayName" AS "facilityName",
        organization."name" AS "organizationName", organization."displayName" AS "organizationDisplayName",
        CASE WHEN latest_unused."expiresAt" IS NULL THEN 'missing' ELSE 'expired' END AS "invitationState"
      ${matches}
      ORDER BY facility."displayName", facility."id"
      LIMIT ${HARBOR_CUSTOMER_PAGE_SIZE} OFFSET ${window.offset}
    ` : [];

    return {
      ...window, total,
      rows: records.map((record) => ({
        facilityId: record.facilityId,
        facilityName: record.facilityName,
        organizationLabel: organizationDisplayLabel({ name: record.organizationName, displayName: record.organizationDisplayName }),
        invitationState: record.invitationState,
      })),
    };
  }, { isolationLevel: "RepeatableRead" });
}

import { EmployeeStatus, RoleKey, type Prisma, type PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type FacilityAdministratorClaim = {
  userId: string;
  email: string;
  displayName: string;
  /**
   * `current`: an open Facility Administrator role period.
   * `home_role`: no open period, but the account's home role is Facility Administrator, so a role
   * repair (facility switch or access grant) would try to open one.
   */
  kind: "current" | "home_role";
  periodId: string | null;
  since: Date | null;
};

export type FacilityAdministratorConflict = {
  facilityId: string;
  facilityName: string;
  organizationName: string;
  claims: FacilityAdministratorClaim[];
};

export type OpenAdministratorPeriodFact = {
  periodId: string;
  startsAt: Date;
  facilityId: string;
  userId: string;
  email: string;
  displayName: string;
};

export type HomeAdministratorFact = {
  userId: string;
  email: string;
  displayName: string;
  homeFacilityId: string;
};

/** Facilities claimed by more than one person, in name order. */
export function groupFacilityAdministratorConflicts(input: {
  openPeriods: readonly OpenAdministratorPeriodFact[];
  homeAdministrators: readonly HomeAdministratorFact[];
  facilities: ReadonlyMap<string, { name: string; organizationName: string }>;
}): FacilityAdministratorConflict[] {
  const claims = new Map<string, FacilityAdministratorClaim[]>();
  const add = (facilityId: string, claim: FacilityAdministratorClaim) => {
    claims.set(facilityId, [...(claims.get(facilityId) ?? []), claim]);
  };
  const holders = new Set<string>();
  for (const period of input.openPeriods) {
    holders.add(`${period.facilityId}:${period.userId}`);
    add(period.facilityId, {
      userId: period.userId,
      email: period.email,
      displayName: period.displayName,
      kind: "current",
      periodId: period.periodId,
      since: period.startsAt,
    });
  }
  for (const user of input.homeAdministrators) {
    if (holders.has(`${user.homeFacilityId}:${user.userId}`)) continue;
    add(user.homeFacilityId, {
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      kind: "home_role",
      periodId: null,
      since: null,
    });
  }

  return [...claims.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([facilityId, rows]) => ({
      facilityId,
      facilityName: input.facilities.get(facilityId)?.name ?? facilityId,
      organizationName: input.facilities.get(facilityId)?.organizationName ?? "",
      claims: rows.sort(
        (a, b) =>
          (a.since?.getTime() ?? Number.POSITIVE_INFINITY) - (b.since?.getTime() ?? Number.POSITIVE_INFINITY) ||
          a.email.localeCompare(b.email),
      ),
    }))
    .sort((a, b) => a.facilityName.localeCompare(b.facilityName) || a.facilityId.localeCompare(b.facilityId));
}

/**
 * Rollout report: facilities with more than one Facility Administrator.
 * Reads only. The one-administrator migration refuses to apply until the `current` rows are resolved.
 */
export async function listFacilityAdministratorConflicts(db: DbClient): Promise<FacilityAdministratorConflict[]> {
  const [periods, homeUsers] = await Promise.all([
    db.userFacilityRolePeriod.findMany({
      where: { roleKey: RoleKey.FACILITY_ADMINISTRATOR, endsAt: null },
      select: {
        id: true,
        startsAt: true,
        userFacilityAccess: {
          select: { facilityId: true, user: { select: { id: true, email: true, displayName: true } } },
        },
      },
    }),
    db.user.findMany({
      where: { isActive: true, facilityId: { not: null }, role: { key: RoleKey.FACILITY_ADMINISTRATOR } },
      select: {
        id: true,
        email: true,
        displayName: true,
        facilityId: true,
        facilityAccesses: {
          select: { facilityId: true, isActive: true, revokedAt: true, rolePeriods: { where: { endsAt: null }, select: { id: true } } },
        },
      },
    }),
  ]);

  // Someone whose employment at their home facility has ended has left; their home role claims nothing.
  const departed = new Set(
    (
      await db.employee.findMany({
        where: { userId: { in: homeUsers.map((user) => user.id) }, status: EmployeeStatus.TERMINATED },
        select: { userId: true, facilityId: true },
      })
    ).map((row) => `${row.facilityId}:${row.userId}`),
  );

  const openPeriods: OpenAdministratorPeriodFact[] = periods.map((period) => ({
    periodId: period.id,
    startsAt: period.startsAt,
    facilityId: period.userFacilityAccess.facilityId,
    userId: period.userFacilityAccess.user.id,
    email: period.userFacilityAccess.user.email,
    displayName: period.userFacilityAccess.user.displayName,
  }));
  const homeAdministrators: HomeAdministratorFact[] = homeUsers
    .filter((user) => {
      if (departed.has(`${user.facilityId}:${user.id}`)) return false;
      const home = user.facilityAccesses.find((access) => access.facilityId === user.facilityId);
      // Role repair opens a period only on an active grant with none open.
      return !home || (home.isActive && home.revokedAt === null && home.rolePeriods.length === 0);
    })
    .map((user) => ({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      homeFacilityId: user.facilityId!,
    }));

  const facilityIds = [...new Set([...openPeriods.map((row) => row.facilityId), ...homeAdministrators.map((row) => row.homeFacilityId)])];
  const facilityRows = facilityIds.length
    ? await db.facility.findMany({
        where: { id: { in: facilityIds } },
        select: { id: true, displayName: true, organization: { select: { name: true } } },
      })
    : [];
  return groupFacilityAdministratorConflicts({
    openPeriods,
    homeAdministrators,
    facilities: new Map(
      facilityRows.map((row) => [row.id, { name: row.displayName, organizationName: row.organization.name }]),
    ),
  });
}

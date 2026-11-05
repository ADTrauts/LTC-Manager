import { tsImport } from "tsx/esm/api";
import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

/** Synthetic CI accounts represent already activated customers, not invite bypasses.
 * Production enrollment tests exercise pending credentials separately. */
export async function activateFixtureAccount(db, user, { facilityId, roleKey }) {
  assertDisposableDatabaseUrl(process.env.VERIFY_DATABASE_URL);
  const { ensureUserFacilityAccessGrant } = await tsImport(
    "../../src/lib/facility-access/assert-user-facility-access.ts", import.meta.url,
  );
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  try {
    await db.$transaction((tx) =>
      ensureUserFacilityAccessGrant(tx, { userId: user.id, facilityId, roleKey }),
    );
  } catch (error) {
    if (roleKey !== "FACILITY_ADMINISTRATOR" || !administratorSeatTaken(error)) throw error;
    await transferFixtureAdministrator(db, user, facilityId);
  }
  return user;
}

function administratorSeatTaken(error) {
  return error?.code === "FACILITY_ADMINISTRATOR_TAKEN"
    || String(error?.message || "").includes("already has a Facility Administrator");
}

/** The seeded demo admin may already hold the one seat. A fixture administrator receives it by transfer. */
async function transferFixtureAdministrator(db, user, facilityId) {
  const { ensureUserFacilityAccessGrant } = await tsImport(
    "../../src/lib/facility-access/assert-user-facility-access.ts", import.meta.url,
  );
  const { inviteFacilityAdministratorSuccessor, acceptFacilityAdministratorInvitation } = await tsImport(
    "../../src/lib/facility-administrator/service.ts", import.meta.url,
  );
  await db.$transaction((tx) =>
    ensureUserFacilityAccessGrant(tx, { userId: user.id, facilityId, roleKey: "SUPERVISOR" }),
  );
  const holder = await db.userFacilityRolePeriod.findFirst({
    where: {
      roleKey: "FACILITY_ADMINISTRATOR",
      endsAt: null,
      userFacilityAccess: { facilityId, userId: { not: user.id } },
    },
    select: { userFacilityAccess: { select: { userId: true } } },
  });
  if (!holder) return;
  const invitation = await inviteFacilityAdministratorSuccessor(db, {
    actorUserId: holder.userFacilityAccess.userId,
    facilityId,
    invitedUserId: user.id,
    outgoingRoleKey: "MANAGER",
  });
  await acceptFacilityAdministratorInvitation(db, { actorUserId: user.id, invitationId: invitation.id });
}


/** Explicit synthetic account acceptance through the canonical link service.
 * Never infer a production link from matching email or write credentials here. */
export async function linkFixtureAccount(db, user, employee, { facilityId, roleKey }) {
  assertDisposableDatabaseUrl(process.env.VERIFY_DATABASE_URL);
  const current = await db.employee.findUniqueOrThrow({ where: { id: employee.id }, select: { userId: true, facilityId: true } });
  if (current.facilityId !== facilityId) throw new Error("Cross-Facility fixture link");
  if (current.userId === user.id) return;
  if (current.userId) throw new Error("Fixture employee already belongs to another account");
  const { issueEmployeeUserLinkInvitation, acceptEmployeeUserLinkInvitation } = await tsImport("../../src/lib/employee-identity/invitations.ts", import.meta.url);
  const invite = await issueEmployeeUserLinkInvitation(db, { employeeId: employee.id, facilityId, targetEmail: user.email, intendedRoleKey: roleKey, invitedByUserId: user.id });
  await acceptEmployeeUserLinkInvitation(db, { rawToken: invite.rawToken, authenticatedUserId: user.id });
}

import { Prisma, EmployeeStatus, EmploymentType, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { FacilitySession } from "@/lib/auth";
import { normalizeAccountIdentifier } from "@/lib/auth-rate-limit";
import { ACCOUNT_INVITE_TTL_MS, hashAccountInviteToken, mintAccountInviteToken } from "@/lib/account-invite/tokens";
import { resolveCurrentInternalFacilityRole } from "@/lib/facility-access/internal-facility-role";
import { onboardFacilityEmployee } from "@/lib/employee-identity/onboard";
import { employeeBelongsToDepartment, syncEmployeeDepartmentMembership } from "@/lib/employee-membership";
import { validateSessionAuthority } from "@/lib/session-revocation";
import { isEmailConfigured, sendAccountInviteEmail } from "@/lib/email";
import { trackEvent } from "@/lib/telemetry";

type Tx = Prisma.TransactionClient;
export class SetupInvitationError extends Error {}
const tokenHash = (raw: string) => hashAccountInviteToken(`facility-manager:${raw}`);
const viewSelect = { id: true, email: true, expiresAt: true, grantAcceptedAt: true, lastDeliveryAt: true, deliveryStatus: true } as const;

export function setupInvitationStatus(row: { expiresAt: Date | null; grantAcceptedAt: Date | null; deliveryStatus: string | null }, now = new Date()) {
  if (row.grantAcceptedAt) return "ACCEPTED";
  if (!row.expiresAt) return "LEGACY_NOTICE";
  if (+row.expiresAt <= +now) return "EXPIRED";
  return row.deliveryStatus === "SENT" ? "PENDING" : row.deliveryStatus === "FAILED" ? "DELIVERY_FAILED" : "DELIVERY_NOT_CONFIGURED";
}
export async function listSetupManagerInvitations(db: PrismaClient, facilityId: string) {
  const rows = await db.onboardingManagerInvite.findMany({ where: { facilityId }, select: viewSelect, orderBy: { createdAt: "asc" } });
  return rows.map((row) => ({ ...row, state: setupInvitationStatus(row) }));
}

async function lockInviter(tx: Tx, userId: string, facilityId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR SHARE`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "UserFacilityAccess" WHERE "userId" = ${userId} AND "facilityId" = ${facilityId} FOR SHARE`);
  await tx.$queryRaw(Prisma.sql`SELECT p."id" FROM "UserFacilityRolePeriod" p JOIN "UserFacilityAccess" a ON a."id" = p."userFacilityAccessId" WHERE a."userId" = ${userId} AND a."facilityId" = ${facilityId} FOR SHARE OF p`);
  const role = await resolveCurrentInternalFacilityRole(tx, { userId, facilityId });
  if (role?.roleKey !== "FACILITY_ADMINISTRATOR") throw new SetupInvitationError("A current Facility Administrator must authorize this invitation. Ask for a new invitation.");
}
export function assertSetupInvitationActor(session: FacilitySession, expectedFacilityId: string) {
  if (session.facilityId !== expectedFacilityId) throw new SetupInvitationError("Facility changed. Return to the setup workspace and try again.");
  if (session.authKind !== "user" || session.scopeKind !== "facility" || session.authMethod === "QUICK_PIN" || session.role !== "FACILITY_ADMINISTRATOR") {
    throw new SetupInvitationError("Inviting managers requires a Facility Administrator password session. Console and partner sessions cannot use User attribution.");
  }
}

/** Names a person already on this Facility's roster as Department head. Returns null when no matching Employee exists. */
export async function nameExistingDepartmentHead(db: PrismaClient, session: FacilitySession, input: { expectedFacilityId: string; departmentId: string; email: string }) {
  assertSetupInvitationActor(session, input.expectedFacilityId);
  const email = normalizeAccountIdentifier(input.email);
  const department = await db.department.findFirst({
    where: { id: input.departmentId, facilityId: session.facilityId, isActive: true },
    select: { id: true },
  });
  if (!department) throw new SetupInvitationError("This Department is not available.");
  const employee = await db.employee.findFirst({
    where: { facilityId: session.facilityId, email: { equals: email, mode: "insensitive" }, status: { not: EmployeeStatus.TERMINATED } },
    select: { id: true, firstName: true, lastName: true, primaryDepartmentId: true, employeeDepartments: { select: { departmentId: true } } },
  });
  if (!employee) return null;
  const addMembership = employeeBelongsToDepartment(employee, department.id) ? null : {
    primaryDepartmentId: employee.primaryDepartmentId,
    additionalDepartmentIds: [...employee.employeeDepartments.map((row) => row.departmentId), department.id],
  };
  await db.$transaction(async (tx) => {
    await lockInviter(tx, session.uid, session.facilityId);
    if (!(await validateSessionAuthority(session, tx)).valid) throw new SetupInvitationError("Your session changed. Sign in again.");
    if (addMembership) {
      await syncEmployeeDepartmentMembership(tx, { employeeId: employee.id, facilityId: session.facilityId, ...addMembership });
    }
    await tx.department.update({ where: { id: department.id }, data: { headEmployeeId: employee.id } });
  }, { isolationLevel: "Serializable" });
  return { employeeId: employee.id, name: `${employee.firstName} ${employee.lastName}`.trim() };
}

/** Issue intent only. No User, Employee, membership or role is created until acceptance. A Department head invitation stores the name and Department for that acceptance. */
export async function issueSetupManagerInvitation(db: PrismaClient, session: FacilitySession, input: { expectedFacilityId: string; email: string; retry?: boolean; departmentId?: string; firstName?: string; lastName?: string }) {
  assertSetupInvitationActor(session, input.expectedFacilityId);
  const email = normalizeAccountIdentifier(input.email);
  const firstName = input.firstName?.trim() ?? "";
  const lastName = input.lastName?.trim() ?? "";
  if (!z.email().safeParse(email).success || email === normalizeAccountIdentifier(session.email)) throw new SetupInvitationError("Enter another person's valid email address.");
  if (input.departmentId && (!z.string().min(1).max(100).safeParse(firstName).success || !z.string().min(1).max(100).safeParse(lastName).success)) {
    throw new SetupInvitationError("Enter the Department head's first and last name.");
  }
  const minted = mintAccountInviteToken();
  const invitation = await db.$transaction(async (tx) => {
    await lockInviter(tx, session.uid, session.facilityId);
    if (!(await validateSessionAuthority(session, tx)).valid) throw new SetupInvitationError("Your session changed. Sign in again.");
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id" = ${session.facilityId} FOR UPDATE`);
    const existing = await tx.onboardingManagerInvite.findUnique({ where: { facilityId_email: { facilityId: session.facilityId, email } } });
    if (existing?.grantAcceptedAt) throw new SetupInvitationError("This invitation was already accepted. Manage existing access through People.");
    if (existing?.expiresAt && +existing.expiresAt > Date.now() && existing.deliveryStatus === "SENT" && !input.retry) {
      throw new SetupInvitationError("An invitation is already pending. Use Retry invitation to replace its link.");
    }
    const person = await tx.user.findUnique({ where: { email }, select: { id: true, isActive: true } });
    if (person && (!person.isActive || await tx.userFacilityAccess.findUnique({ where: { userId_facilityId: { userId: person.id, facilityId: session.facilityId } }, select: { id: true } }))) {
      throw new SetupInvitationError("This person has existing or historical access. Use People to review their role or lifecycle; an invitation cannot change it.");
    }
    if (input.departmentId) {
      const department = await tx.department.findFirst({ where: { id: input.departmentId, facilityId: session.facilityId, isActive: true }, select: { id: true } });
      if (!department) throw new SetupInvitationError("This Department is not available.");
    }
    const head = input.departmentId ? { departmentId: input.departmentId, firstName, lastName } : {};
    return tx.onboardingManagerInvite.upsert({
      where: { facilityId_email: { facilityId: session.facilityId, email } },
      create: { facilityId: session.facilityId, email, tokenHash: tokenHash(minted.rawToken), expiresAt: minted.expiresAt, invitedByUserId: session.uid, deliveryStatus: null, ...head },
      update: { tokenHash: tokenHash(minted.rawToken), expiresAt: minted.expiresAt, invitedByUserId: session.uid, deliveryStatus: null, lastDeliveryAt: null, ...head },
      select: { id: true },
    });
  }, { isolationLevel: "Serializable" });
  await trackEvent("onboarding.manager.invited", { facilityId: session.facilityId, invitationId: invitation.id, actorUserId: session.uid });
  return { id: invitation.id, rawToken: minted.rawToken };
}

export async function deliverSetupManagerInvitation(db: PrismaClient, input: { id: string; rawToken: string; origin: string }, deps: {
  configured?: () => boolean;
  send?: typeof sendAccountInviteEmail;
} = {}) {
  const row = await db.onboardingManagerInvite.findUniqueOrThrow({ where: { id: input.id }, include: { facility: { select: { displayName: true } } } });
  if (row.grantAcceptedAt || row.tokenHash !== tokenHash(input.rawToken) || !row.expiresAt || +row.expiresAt <= Date.now()) throw new SetupInvitationError("This invitation changed. Refresh setup before retrying.");
  let deliveryStatus = "NOT_CONFIGURED";
  if ((deps.configured ?? isEmailConfigured)()) {
    const url = new URL("/accept-invite", input.origin); url.searchParams.set("kind", "manager"); url.searchParams.set("token", input.rawToken);
    try {
      const sent = await (deps.send ?? sendAccountInviteEmail)({ to: row.email, displayName: [row.firstName, row.lastName].filter(Boolean).join(" "), facilityDisplayName: row.facility.displayName, inviteUrl: url.toString(), expiresInDays: ACCOUNT_INVITE_TTL_MS / 86_400_000 });
      deliveryStatus = sent.sent ? "SENT" : sent.reason === "not_configured" ? "NOT_CONFIGURED" : "FAILED";
    } catch { deliveryStatus = "FAILED"; }
  }
  // An older in-flight send may not overwrite delivery state for a rotated link.
  await db.onboardingManagerInvite.updateMany({ where: { id: row.id, tokenHash: row.tokenHash, grantAcceptedAt: null }, data: { deliveryStatus, lastDeliveryAt: new Date() } });
  await trackEvent("onboarding.manager.delivery", { facilityId: row.facilityId, invitationId: row.id, deliveryStatus });
  return { id: row.id, deliveryStatus };
}

export async function findSetupManagerInvitation(db: PrismaClient, rawToken: string) {
  if (rawToken.length < 20 || rawToken.length > 200) return null;
  const row = await db.onboardingManagerInvite.findUnique({ where: { tokenHash: tokenHash(rawToken) }, include: { facility: { select: { displayName: true } } } });
  return row && !row.grantAcceptedAt && row.expiresAt && +row.expiresAt > Date.now() ? row : null;
}

/** Existing account-activation token semantics + canonical workforce identity/grant
 * owner, executed only after explicit recipient acceptance. Never a bulk adapter.
 */
export async function acceptSetupManagerInvitation(db: PrismaClient, input: { rawToken: string; authenticatedUserId?: string | null; firstName: string; lastName: string; employmentType: EmploymentType; passwordHash?: string | null }) {
  const accepted = await db.$transaction(async (tx) => {
    const hash = tokenHash(input.rawToken);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "OnboardingManagerInvite" WHERE "tokenHash" = ${hash} FOR UPDATE`);
    const row = await tx.onboardingManagerInvite.findUnique({ where: { tokenHash: hash } });
    if (!row || row.grantAcceptedAt || !row.expiresAt || +row.expiresAt <= Date.now() || !row.invitedByUserId) throw new SetupInvitationError("This invitation is invalid, expired or already accepted.");
    await lockInviter(tx, row.invitedByUserId, row.facilityId);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "email" = ${row.email} FOR UPDATE`);
    const user = await tx.user.findUnique({ where: { email: row.email } });
    if (user && (!user.isActive || (input.authenticatedUserId && user.id !== input.authenticatedUserId))) throw new SetupInvitationError("Sign in with the invited active account.");
    if (user?.passwordHash && input.authenticatedUserId !== user.id) throw new SetupInvitationError("Sign in with the invited email before accepting.");
    if (!user?.passwordHash && !input.passwordHash) throw new SetupInvitationError("Set a password to accept this invitation.");
    if (user && await tx.userFacilityAccess.findUnique({ where: { userId_facilityId: { userId: user.id, facilityId: row.facilityId } }, select: { id: true } })) throw new SetupInvitationError("Existing or historical Facility access must be reviewed in People.");
    if (await tx.employee.findFirst({ where: { facilityId: row.facilityId, OR: [{ email: { equals: row.email, mode: "insensitive" } }, ...(user ? [{ userId: user.id }] : [])] }, select: { id: true } })) throw new SetupInvitationError("An Employee already exists. Use the existing identity or lifecycle actions in People.");
    if (!z.string().trim().min(1).max(100).safeParse(input.firstName).success || !z.string().trim().min(1).max(100).safeParse(input.lastName).success) throw new SetupInvitationError("First and last names are required.");
    if (!Object.values(EmploymentType).includes(input.employmentType)) throw new SetupInvitationError("Choose your work arrangement.");
    const department = row.departmentId
      ? await tx.department.findFirst({ where: { id: row.departmentId, facilityId: row.facilityId, isActive: true }, select: { id: true } })
      : null;
    if (row.departmentId && !department) throw new SetupInvitationError("This Department is no longer available. Ask the Facility Administrator for a new invitation.");
    const result = await onboardFacilityEmployee(tx, {
      facilityId: row.facilityId, actorUserId: row.invitedByUserId, firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: row.email,
      roleType: "MANAGER", employmentType: input.employmentType, status: "ACTIVE", confirmExistingUser: Boolean(user),
      extras: department ? { primaryDepartmentId: department.id } : undefined,
    });
    if (department) await tx.department.update({ where: { id: department.id }, data: { headEmployeeId: result.employeeId } });
    const now = new Date();
    if (!user?.passwordHash) await tx.user.update({ where: { id: result.userId }, data: { passwordHash: input.passwordHash!, emailVerifiedAt: now } });
    await tx.onboardingManagerInvite.update({ where: { id: row.id }, data: { grantAcceptedAt: now, acceptedAt: row.acceptedAt ?? now, acceptedByUserId: result.userId } });
    return { userId: result.userId, employeeId: result.employeeId, facilityId: row.facilityId, invitationId: row.id };
  }, { isolationLevel: "Serializable", timeout: 20_000 });
  await trackEvent("onboarding.manager.accepted", { facilityId: accepted.facilityId, invitationId: accepted.invitationId, userId: accepted.userId });
  return accepted;
}

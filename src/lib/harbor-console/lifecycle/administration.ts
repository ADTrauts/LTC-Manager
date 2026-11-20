import { Prisma, type HarborStaffLifecycleIntent, type PlatformStaffRole } from "@prisma/client";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";

import { lockHarborStaffSession } from "../auth";
import { harborLoginIdentity } from "../login-receipt";
import type { HarborJwtPayload } from "../session";
import { prisma } from "@/lib/prisma";
import { beginAssertion, digest, liveChallenge, requireLifecycle, secret, verifyStaffAssertion } from "./ceremony";
import { lifecycleEmailAllowed, type StaffLifecycleConfig } from "./gate";
import { deliverStaffLifecycleMail, type StaffLifecycleMail } from "./mail";

export const staffEmail = z.string().trim().toLowerCase().max(200).email();
const id = z.string().min(1).max(180);
const caseReference = z.string().regex(/^CASE-[A-Z0-9-]{1,50}$/);
export const staffAction = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("approve-roster"), email: staffEmail }),
  z.strictObject({ action: z.literal("invite"), email: staffEmail }),
  z.strictObject({ action: z.literal("approve-recovery"), intentId: id, proofReference: caseReference }),
  z.strictObject({ action: z.literal("change-authority"), staffId: id,
    role: z.enum(["OWNER", "MEMBER"]), active: z.boolean(),
    reason: z.enum(["ROLE_ASSIGNMENT", "DEPARTURE", "SECURITY_RESPONSE", "RETURN_TO_DUTY"]) }),
  z.strictObject({ action: z.literal("approve-owner-change"), intentId: id }),
  z.strictObject({ action: z.literal("approve-sole-owner-succession"), intentId: id, proofReference: caseReference }),
]);
type StaffAction = z.infer<typeof staffAction>;
type Tx = Prisma.TransactionClient;
type Mail = StaffLifecycleMail;

export const validFor = (minutes: number) => new Date(Date.now() + minutes * 60_000);

export async function lifecycleTransaction<T>(run: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    // Lifecycle writers serialize before locking staff. Logout only takes the staff lock.
    await tx.$queryRaw<unknown[]>`SELECT 1::int AS locked FROM pg_advisory_xact_lock(617883, 1)`;
    return run(tx);
  }, { isolationLevel: "ReadCommitted" });
}

export async function audit(tx: Tx, action: string, subject: string, actorId?: string, intentId?: string, detail?: Prisma.InputJsonValue) {
  await tx.harborStaffLifecycleAudit.create({ data: { action, subject, actorId, intentId, detail } });
}

async function authorize(tx: Tx, config: StaffLifecycleConfig, session: HarborJwtPayload, action: StaffAction) {
  if (config.mode === "production") {
    // This release retains the sole OWNER. Authority changes/succession need a separately approved release.
    requireLifecycle(["approve-roster", "invite", "approve-recovery"].includes(action.action));
    if (action.action === "approve-recovery") requireLifecycle(config.recoveryEnabled);
    else requireLifecycle(config.invitationsEnabled);
  }
  if (action.action === "approve-roster" || action.action === "invite") {
    requireLifecycle(lifecycleEmailAllowed(config, action.email));
  }
  const login = harborLoginIdentity(session);
  requireLifecycle(login && !login.assistance && login);
  const result = await lockHarborStaffSession(session, tx);
  requireLifecycle(result.valid);
  const { staff } = result;
  requireLifecycle(await tx.harborStaffRosterEntry.findUnique({ where: { email: staff.email } }));
  if (action.action === "approve-recovery" || action.action === "approve-sole-owner-succession") {
    requireLifecycle(config.recoveryApprovers.has(staff.id));
  } else {
    requireLifecycle(staff.role === "OWNER" && (action.action === "approve-roster"
      ? config.rosterApprovers.has(staff.id)
      : config.administrators.has(staff.id)));
  }
  return { login, staff };
}

export async function beginStaffAction(config: StaffLifecycleConfig, session: HarborJwtPayload, action: StaffAction) {
  return lifecycleTransaction(async (tx) => {
    const { login, staff } = await authorize(tx, config, session, action);
    return beginAssertion(tx, config, {
      kind: "STAFF_ACTION", staffId: staff.id, staffVersion: staff.sessionVersion, loginKey: login.key, action,
    });
  });
}

export async function activeIntent(tx: Tx, id: string, kind: HarborStaffLifecycleIntent["kind"]) {
  const intent = await tx.harborStaffLifecycleIntent.findUnique({ where: { id } });
  requireLifecycle(intent && intent.kind === kind && !intent.usedAt && intent.expiresAt.getTime() > Date.now() && intent);
  return intent;
}

export async function lockSubject(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "PlatformStaff" WHERE id=${id} FOR NO KEY UPDATE`;
  const target = await tx.platformStaff.findUnique({ where: { id } });
  requireLifecycle(target);
  return target;
}

export async function hasOtherRecoverableOwner(tx: Tx, excludeId: string) {
  const enrolled = await tx.platformStaff.findMany({ where: {
    id: { not: excludeId }, isActive: true, role: "OWNER", lifecyclePasskeys: { some: {} },
  }, select: { email: true } });
  return await tx.harborStaffRosterEntry.count({ where: { email: { in: enrolled.map(({ email }) => email) } } }) > 0;
}

async function changeAuthority(tx: Tx, actorId: string, target: Awaited<ReturnType<typeof lockSubject>>,
  role: PlatformStaffRole, active: boolean, reason: string, intentId?: string) {
  requireLifecycle(role !== target.role || active !== target.isActive);
  if (target.role === "OWNER" && target.isActive && (!active || role !== "OWNER")) {
    requireLifecycle(await hasOtherRecoverableOwner(tx, target.id));
  }
  if (role === "OWNER" && active) {
    requireLifecycle(await tx.harborStaffRosterEntry.findUnique({ where: { email: target.email } }));
    requireLifecycle(await tx.harborStaffPasskey.count({ where: { staffId: target.id } }) > 0);
  }
  await tx.platformStaff.update({ where: { id: target.id }, data: {
    role, isActive: active, sessionVersion: { increment: 1 },
  } });
  await audit(tx, "AUTHORITY_CHANGED", target.id, actorId, intentId,
    { priorRole: target.role, priorActive: target.isActive, role, active, reason });
}

export async function executeStaffAction(
  config: StaffLifecycleConfig, session: HarborJwtPayload, challengeId: string, response: AuthenticationResponseJSON,
) {
  const result = await lifecycleTransaction(async (tx): Promise<{ intentId?: string; mail?: Mail }> => {
    const row = await liveChallenge(tx, challengeId, "STAFF_ACTION");
    const parsed = staffAction.safeParse(row.action);
    requireLifecycle(parsed.success && parsed);
    const action = parsed.data;
    const { login, staff } = await authorize(tx, config, session, action);
    requireLifecycle(row.staffId === staff.id && row.staffVersion === staff.sessionVersion && row.loginKey === login.key);
    await verifyStaffAssertion(tx, config, row, response);

    switch (action.action) {
      case "approve-roster": {
        await tx.harborStaffRosterEntry.upsert({
          where: { email: action.email }, create: { email: action.email, approvedById: staff.id },
          update: { approvedById: staff.id, approvedAt: new Date() },
        });
        await audit(tx, "ROSTER_APPROVED", action.email, staff.id);
        return {};
      }
      case "invite": {
        requireLifecycle(await tx.harborStaffRosterEntry.findUnique({ where: { email: action.email } }));
        requireLifecycle(!await tx.platformStaff.findUnique({ where: { email: action.email } }));
        await tx.harborStaffLifecycleIntent.updateMany({ where: { email: action.email, kind: "INVITE", usedAt: null },
          data: { usedAt: new Date(), tokenHash: null } });
        const token = secret();
        const intent = await tx.harborStaffLifecycleIntent.create({ data: {
          kind: "INVITE", email: action.email, tokenHash: digest(token), requestedById: staff.id,
          requestedByVersion: staff.sessionVersion, expiresAt: validFor(1440),
        } });
        await audit(tx, "INVITATION_ISSUED", action.email, staff.id, intent.id);
        return { intentId: intent.id, mail: { kind: "INVITE", to: intent.email, token, intentId: intent.id } };
      }
      case "approve-recovery": {
        const intent = await activeIntent(tx, action.intentId, "RECOVERY");
        requireLifecycle(intent.staffId && intent.staffId !== staff.id && !intent.approvedById);
        const subject = await lockSubject(tx, intent.staffId);
        requireLifecycle(lifecycleEmailAllowed(config, subject.email));
        requireLifecycle(subject.isActive && subject.sessionVersion === intent.staffVersion && subject.email === intent.email);
        await tx.harborStaffLifecycleIntent.update({ where: { id: intent.id }, data: {
          approvedById: staff.id, approvedByVersion: staff.sessionVersion, proofReference: action.proofReference,
        } });
        await audit(tx, "RECOVERY_PROOF_APPROVED", subject.id, staff.id, intent.id,
          { proofReference: action.proofReference, ...(config.recoveryProofPolicy ? { policy: config.recoveryProofPolicy } : {}) });
        return { intentId: intent.id };
      }
      case "change-authority": {
        requireLifecycle(action.staffId !== staff.id);
        const target = await lockSubject(tx, action.staffId);
        requireLifecycle(target.role !== action.role || target.isActive !== action.active);
        if (target.role === "OWNER" || action.role === "OWNER") {
          const intent = await tx.harborStaffLifecycleIntent.create({ data: {
            kind: "OWNER_CHANGE", email: target.email, staffId: target.id, staffVersion: target.sessionVersion,
            desiredRole: action.role, desiredActive: action.active, changeReason: action.reason, requestedById: staff.id,
            requestedByVersion: staff.sessionVersion, expiresAt: validFor(60),
          } });
          await audit(tx, "OWNER_CHANGE_REQUESTED", target.id, staff.id, intent.id, { role: action.role, active: action.active, reason: action.reason });
          return { intentId: intent.id };
        }
        await changeAuthority(tx, staff.id, target, action.role, action.active, action.reason);
        return {};
      }
      case "approve-owner-change":
      case "approve-sole-owner-succession": {
        const intent = await activeIntent(tx, action.intentId, "OWNER_CHANGE");
        requireLifecycle(intent.staffId && intent.staffId !== staff.id && intent.requestedById &&
          intent.requestedById !== staff.id && intent.desiredRole && intent.changeReason && typeof intent.desiredActive === "boolean");
        const requester = await lockSubject(tx, intent.requestedById);
        requireLifecycle(requester.isActive && requester.role === "OWNER" && config.administrators.has(requester.id) &&
          requester.sessionVersion === intent.requestedByVersion);
        requireLifecycle(await tx.harborStaffRosterEntry.findUnique({ where: { email: requester.email } }));
        const target = await lockSubject(tx, intent.staffId);
        requireLifecycle(target.sessionVersion === intent.staffVersion && target.email === intent.email);
        let proofReference: string | undefined;
        if (action.action === "approve-sole-owner-succession") {
          requireLifecycle(target.role === "MEMBER" && target.isActive && intent.desiredRole === "OWNER" &&
            intent.desiredActive && !await hasOtherRecoverableOwner(tx, requester.id));
          proofReference = action.proofReference;
          await audit(tx, "SOLE_OWNER_SUCCESSION_APPROVED", target.id, staff.id, intent.id, { proofReference });
        }
        await changeAuthority(tx, staff.id, target, intent.desiredRole, intent.desiredActive, intent.changeReason, intent.id);
        await tx.harborStaffLifecycleIntent.update({ where: { id: intent.id }, data: {
          approvedById: staff.id, approvedByVersion: staff.sessionVersion, proofReference, usedAt: new Date(),
        } });
        return { intentId: intent.id };
      }
    }
  });
  if (result.mail) {
    try {
      await deliverStaffLifecycleMail(config, result.mail);
    } catch {
      const mail = result.mail;
      await lifecycleTransaction(async (tx) => {
        await tx.harborStaffLifecycleIntent.updateMany({ where: { id: mail.intentId, usedAt: null },
          data: { usedAt: new Date(), tokenHash: null } });
        await audit(tx, "INVITATION_DELIVERY_FAILED", mail.to, session.uid, mail.intentId);
      });
      throw new Error("Staff email delivery unavailable.");
    }
  }
  return { intentId: result.intentId };
}

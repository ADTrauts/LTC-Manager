import { type HarborStaffLifecycleIntent, type Prisma } from "@prisma/client";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import bcrypt from "bcryptjs";

import { audit, deliverSyntheticMail, hasOtherRecoverableOwner, lifecycleTransaction, lockSubject, validFor } from "./administration";
import { beginAssertion, beginEnrollment, digest, fiveMinutes, liveChallenge, requireLifecycle,
  secret, verifiedEnrollment, verifyStaffAssertion } from "./ceremony";
import type { StaffLifecycleConfig } from "./gate";

type Tx = Prisma.TransactionClient;

async function tokenIntent(tx: Tx, token: string) {
  const intent = await tx.harborStaffLifecycleIntent.findUnique({ where: { tokenHash: digest(token) } });
  requireLifecycle(intent && !intent.usedAt && intent.expiresAt.getTime() > Date.now() &&
    intent.kind !== "OWNER_CHANGE" && intent);
  requireLifecycle(await tx.harborStaffRosterEntry.findUnique({ where: { email: intent.email } }));
  return intent;
}

async function existingSubject(tx: Tx, intent: HarborStaffLifecycleIntent) {
  requireLifecycle(intent.staffId);
  const staff = await lockSubject(tx, intent.staffId);
  requireLifecycle(staff.isActive && staff.email === intent.email && staff.sessionVersion === intent.staffVersion);
  return staff;
}

export async function requestRecovery(config: StaffLifecycleConfig, email: string) {
  const mail = await lifecycleTransaction(async (tx) => {
    if (!await tx.harborStaffRosterEntry.findUnique({ where: { email } })) return null;
    const staff = await tx.platformStaff.findUnique({ where: { email } });
    if (!staff?.isActive) return null;
    const latest = await tx.harborStaffLifecycleIntent.findFirst({
      where: { email, kind: "RECOVERY", staffVersion: staff.sessionVersion, usedAt: null, expiresAt: { gt: new Date() } },
    });
    // Unauthenticated repeats cannot rotate a token or erase independent approval.
    if (latest) return null;
    const token = secret();
    const intent = await tx.harborStaffLifecycleIntent.create({ data: {
      kind: "RECOVERY", email, staffId: staff.id, staffVersion: staff.sessionVersion,
      expiresAt: validFor(30), tokenHash: digest(token),
    } });
    await audit(tx, "RECOVERY_REQUESTED", staff.id, undefined, intent.id);
    return { kind: "RECOVERY" as const, token, to: email, intentId: intent.id };
  });
  if (!mail) return;
  try {
    await deliverSyntheticMail(config, mail);
  } catch {
    // The public route responds uniformly. A failed delivery revokes this token so a retry can deliver a new one.
    await lifecycleTransaction(async (tx) => {
      const intent = await tx.harborStaffLifecycleIntent.findUniqueOrThrow({ where: { id: mail.intentId } });
      await tx.harborStaffLifecycleIntent.updateMany({
        where: { id: intent.id, usedAt: null }, data: { tokenHash: null, usedAt: new Date() },
      });
      await audit(tx, "RECOVERY_DELIVERY_FAILED", intent.staffId ?? intent.email, undefined, intent.id);
    });
  }
}

export async function beginRecoveryFactor(config: StaffLifecycleConfig, token: string) {
  return lifecycleTransaction(async (tx) => {
    const intent = await tokenIntent(tx, token);
    requireLifecycle(intent.kind === "RECOVERY");
    const staff = await existingSubject(tx, intent);
    return beginAssertion(tx, config, {
      kind: "RECOVERY_FACTOR", staffId: staff.id, staffVersion: staff.sessionVersion, intentId: intent.id,
    });
  });
}

export async function finishRecoveryFactor(config: StaffLifecycleConfig, token: string, challengeId: string,
  response: AuthenticationResponseJSON) {
  await lifecycleTransaction(async (tx) => {
    const intent = await tokenIntent(tx, token);
    requireLifecycle(intent.kind === "RECOVERY");
    const staff = await existingSubject(tx, intent);
    const row = await liveChallenge(tx, challengeId, "RECOVERY_FACTOR");
    requireLifecycle(row.intentId === intent.id && row.staffId === staff.id && row.staffVersion === staff.sessionVersion);
    await verifyStaffAssertion(tx, config, row, response);
    await tx.harborStaffLifecycleIntent.update({ where: { id: intent.id }, data: { selfVerifiedAt: new Date() } });
    await audit(tx, "RECOVERY_FACTOR_VERIFIED", staff.id, staff.id, intent.id);
  });
}

async function canEnroll(tx: Tx, config: StaffLifecycleConfig, intent: HarborStaffLifecycleIntent) {
  if (intent.kind === "INVITE") {
    requireLifecycle(!await tx.platformStaff.findUnique({ where: { email: intent.email } }));
    return null;
  }
  const staff = await existingSubject(tx, intent);
  if (intent.kind === "BOOTSTRAP") {
    // The synthetic operator issues this escrow credential outside the public routes.
    requireLifecycle(intent.approvedById && intent.proofReference && intent.approvedById !== staff.id);
    requireLifecycle(!await tx.harborStaffPasskey.count({ where: { staffId: staff.id } }));
  } else {
    const soleOwner = staff.role === "OWNER" && !await hasOtherRecoverableOwner(tx, staff.id);
    const reviewer = intent.approvedById && intent.proofReference && intent.approvedById !== staff.id &&
      config.recoveryApprovers.has(intent.approvedById) &&
      typeof intent.approvedByVersion === "number" &&
      await tx.platformStaff.findFirst({ where: {
        id: intent.approvedById, isActive: true, sessionVersion: intent.approvedByVersion,
      } });
    const liveFactor = intent.selfVerifiedAt && intent.selfVerifiedAt.getTime() + fiveMinutes > Date.now();
    // Proof from the account's enrolled factor is enough only for routine recovery.
    requireLifecycle(reviewer || (!soleOwner && liveFactor));
  }
  return staff;
}

export async function beginIdentityEnrollment(config: StaffLifecycleConfig, token: string) {
  return lifecycleTransaction(async (tx) => {
    const intent = await tokenIntent(tx, token);
    await canEnroll(tx, config, intent);
    return beginEnrollment(tx, config, intent.id, intent.email);
  });
}

export async function finishIdentityEnrollment(
  config: StaffLifecycleConfig, token: string, challengeId: string, response: RegistrationResponseJSON,
  password: string, displayName?: string,
) {
  const passwordHash = await bcrypt.hash(password, 12);
  const notice = await lifecycleTransaction(async (tx) => {
    const intent = await tokenIntent(tx, token);
    const subject = await canEnroll(tx, config, intent);
    const row = await liveChallenge(tx, challengeId, "ENROLL");
    requireLifecycle(row.intentId === intent.id);
    const key = await verifiedEnrollment(tx, config, row, response);
    const now = new Date();
    const claimed = await tx.harborStaffLifecycleIntent.updateMany({
      where: { id: intent.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now, tokenHash: null },
    });
    requireLifecycle(claimed.count === 1);
    let staffId: string;
    if (subject) {
      staffId = subject.id;
      await tx.platformStaff.update({ where: { id: staffId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
      await tx.harborStaffPasskey.deleteMany({ where: { staffId } });
    } else {
      requireLifecycle(displayName);
      const staff = await tx.platformStaff.create({ data: { email: intent.email, displayName, passwordHash, role: "MEMBER", isActive: true } });
      staffId = staff.id;
    }
    await tx.harborStaffPasskey.create({ data: { ...key, staffId } });
    const action = subject ? intent.kind === "BOOTSTRAP" ? "BOOTSTRAP_COMPLETED" : "RECOVERY_COMPLETED" : "STAFF_ACTIVATED";
    await audit(tx, action, staffId, staffId, intent.id, { approvedById: intent.approvedById });
    return intent.kind === "RECOVERY" ? { kind: "RECOVERY_COMPLETED" as const, to: intent.email, intentId: intent.id, staffId } : null;
  });
  if (notice) {
    const { staffId, ...mail } = notice;
    try {
      await deliverSyntheticMail(config, mail);
    } catch {
      await lifecycleTransaction((tx) => audit(tx, "RECOVERY_NOTICE_DELIVERY_FAILED", staffId, undefined, mail.intentId));
    }
  }
}

export async function beginMfaSignIn(config: StaffLifecycleConfig, staffId: string, staffVersion: number, browserProof: string) {
  return lifecycleTransaction(async (tx) => {
    const staff = await lockSubject(tx, staffId);
    requireLifecycle(staff.isActive && staff.sessionVersion === staffVersion);
    requireLifecycle(await tx.harborStaffRosterEntry.findUnique({ where: { email: staff.email } }));
    return beginAssertion(tx, config, { kind: "SIGN_IN", staffId, staffVersion, loginKey: digest(browserProof) });
  });
}

export async function finishMfaSignIn(
  config: StaffLifecycleConfig, challengeId: string, response: AuthenticationResponseJSON, browserProof: string,
) {
  return lifecycleTransaction(async (tx) => {
    const row = await liveChallenge(tx, challengeId, "SIGN_IN");
    requireLifecycle(row.staffId && row.loginKey === digest(browserProof) && row.staffId);
    const staff = await lockSubject(tx, row.staffId);
    requireLifecycle(staff.isActive && staff.sessionVersion === row.staffVersion);
    requireLifecycle(await tx.harborStaffRosterEntry.findUnique({ where: { email: staff.email } }));
    await verifyStaffAssertion(tx, config, row, response);
    return { id: staff.id, email: staff.email, displayName: staff.displayName, role: staff.role, sessionVersion: staff.sessionVersion };
  });
}

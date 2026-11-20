import bcrypt from "bcryptjs";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import type { Prisma } from "@prisma/client";

import { lockHarborStaffSession } from "../auth";
import { harborLoginIdentity } from "../login-receipt";
import type { HarborJwtPayload } from "../session";
import { audit, lifecycleTransaction } from "./administration";
import { beginEnrollment, liveChallenge, requireLifecycle, verifiedEnrollment } from "./ceremony";
import type { StaffLifecycleConfig } from "./gate";

async function initialOwner(tx: Prisma.TransactionClient, config: StaffLifecycleConfig,
  session: HarborJwtPayload, password: string) {
  const login = harborLoginIdentity(session);
  requireLifecycle(config.mode === "production" && login && !login.assistance && login);
  requireLifecycle(config.administrators.has(session.uid) && config.rosterApprovers.has(session.uid));
  const authority = await lockHarborStaffSession(session, tx);
  requireLifecycle(authority.valid && authority.staff.role === "OWNER");
  requireLifecycle(await tx.platformStaff.count({ where: { isActive: true, role: "OWNER" } }) === 1);
  requireLifecycle(await tx.harborStaffPasskey.count({ where: { staffId: session.uid } }) === 0);
  const staff = await tx.platformStaff.findUniqueOrThrow({ where: { id: session.uid } });
  requireLifecycle(await bcrypt.compare(password, staff.passwordHash));
  return { staff, login };
}

/** Enroll the existing sole OWNER; never replaces a key or consumes a recovery/bootstrap ticket. */
export async function beginOwnerEnrollment(config: StaffLifecycleConfig, session: HarborJwtPayload, password: string) {
  return lifecycleTransaction(async (tx) => {
    const { staff, login } = await initialOwner(tx, config, session, password);
    return beginEnrollment(tx, config, null, staff.email, login.key,
      { staffId: staff.id, staffVersion: staff.sessionVersion });
  });
}

export async function finishOwnerEnrollment(config: StaffLifecycleConfig, session: HarborJwtPayload,
  password: string, challengeId: string, response: RegistrationResponseJSON) {
  await lifecycleTransaction(async (tx) => {
    const { staff, login } = await initialOwner(tx, config, session, password);
    const row = await liveChallenge(tx, challengeId, "ENROLL");
    requireLifecycle(row.intentId === null && row.staffId === staff.id &&
      row.staffVersion === staff.sessionVersion && row.loginKey === login.key);
    const key = await verifiedEnrollment(tx, config, row, response);
    await tx.harborStaffPasskey.create({ data: { ...key, staffId: staff.id } });
    await tx.harborStaffRosterEntry.upsert({ where: { email: staff.email },
      create: { email: staff.email, approvedById: staff.id }, update: {} });
    await tx.platformStaff.update({ where: { id: staff.id }, data: { sessionVersion: { increment: 1 } } });
    await audit(tx, "OWNER_INITIAL_PASSKEY_ENROLLED", staff.id, staff.id);
  });
}

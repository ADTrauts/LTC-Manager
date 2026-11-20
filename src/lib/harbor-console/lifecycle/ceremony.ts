import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { Prisma, type HarborStaffLifecycleChallenge, type HarborStaffChallengeKind } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

import type { StaffLifecycleConfig } from "./gate";

export const fiveMinutes = 5 * 60_000;
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const secret = () => randomBytes(32).toString("base64url");

export class StaffLifecycleDenied extends Error {
  constructor() { super("Staff lifecycle request could not be verified."); }
}

export function requireLifecycle(value: unknown): asserts value {
  if (!value) throw new StaffLifecycleDenied();
}

type Tx = Prisma.TransactionClient;
type Binding = Pick<Prisma.HarborStaffLifecycleChallengeUncheckedCreateInput,
  "kind" | "staffId" | "staffVersion" | "loginKey" | "intentId" | "action">;

export async function beginAssertion(tx: Tx, config: StaffLifecycleConfig, binding: Binding & { staffId: string }) {
  const keys = await tx.harborStaffPasskey.findMany({ where: { staffId: binding.staffId }, select: { id: true }, take: 20 });
  requireLifecycle(keys.length);
  const options = await generateAuthenticationOptions({
    rpID: config.rpID, userVerification: "required", timeout: fiveMinutes,
    allowCredentials: keys.map(({ id }) => ({ id })),
  });
  const row = await tx.harborStaffLifecycleChallenge.create({ data: {
    ...binding, challenge: options.challenge, expiresAt: new Date(Date.now() + fiveMinutes),
  } });
  return { challengeId: row.id, options };
}

export async function beginEnrollment(tx: Tx, config: StaffLifecycleConfig, intentId: string | null, email: string,
  loginKey: string | null, binding?: { staffId: string; staffVersion: number }) {
  const options = await generateRegistrationOptions({
    rpName: "Vssyl Console", rpID: config.rpID, userName: email,
    userID: new TextEncoder().encode(digest(email).slice(0, 32)),
    timeout: fiveMinutes, attestationType: "none",
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    supportedAlgorithmIDs: [-7, -257],
  });
  const row = await tx.harborStaffLifecycleChallenge.create({ data: {
    kind: "ENROLL", intentId, loginKey, ...binding, challenge: options.challenge, expiresAt: new Date(Date.now() + fiveMinutes),
  } });
  return { challengeId: row.id, options };
}

export async function liveChallenge(tx: Tx, id: string, kind: HarborStaffChallengeKind) {
  const row = await tx.harborStaffLifecycleChallenge.findUnique({ where: { id } });
  requireLifecycle(row && row.kind === kind && !row.usedAt && row.expiresAt.getTime() > Date.now() && row);
  return row;
}

export async function consumeChallenge(tx: Tx, row: HarborStaffLifecycleChallenge) {
  const now = new Date();
  const claimed = await tx.harborStaffLifecycleChallenge.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
  });
  requireLifecycle(claimed.count === 1);
  return now;
}

export async function verifyStaffAssertion(
  tx: Tx, config: StaffLifecycleConfig, row: HarborStaffLifecycleChallenge, response: AuthenticationResponseJSON,
) {
  const key = await tx.harborStaffPasskey.findUnique({ where: { id: response.id } });
  requireLifecycle(key && key.staffId === row.staffId && key);
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response, expectedChallenge: row.challenge, expectedOrigin: config.origin, expectedRPID: config.rpID,
      requireUserVerification: true,
      credential: { id: key.id, publicKey: new Uint8Array(key.publicKey), counter: Number(key.counter) },
    });
  } catch {
    throw new StaffLifecycleDenied();
  }
  requireLifecycle(result.verified);
  const usedAt = await consumeChallenge(tx, row);
  await tx.harborStaffPasskey.update({ where: { id: key.id }, data: { counter: BigInt(result.authenticationInfo.newCounter) } });
  return usedAt;
}

export async function verifiedEnrollment(
  tx: Tx, config: StaffLifecycleConfig, row: HarborStaffLifecycleChallenge, response: RegistrationResponseJSON,
) {
  let result;
  try {
    result = await verifyRegistrationResponse({
      response, expectedChallenge: row.challenge, expectedOrigin: config.origin, expectedRPID: config.rpID,
      requireUserVerification: true,
    });
  } catch {
    throw new StaffLifecycleDenied();
  }
  requireLifecycle(result.verified && result.registrationInfo);
  await consumeChallenge(tx, row);
  const { id, publicKey, counter } = result.registrationInfo.credential;
  return { id, publicKey: Buffer.from(publicKey), counter: BigInt(counter) };
}

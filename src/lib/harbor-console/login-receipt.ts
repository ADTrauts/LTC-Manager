import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { HARBOR_JWT_CLOCK_TOLERANCE_SECONDS, HARBOR_LOGIN_ID, HARBOR_TOKEN_USE, type HarborJwtPayload, verifyHarborSessionToken } from "./session";

/** Historic tokens with a JTI were issued only by the assistance pilot. */
export function harborLoginIdentity(claim: HarborJwtPayload) {
  if (!claim.uid || typeof claim.jti !== "string" || !HARBOR_LOGIN_ID.test(claim.jti) ||
      typeof claim.exp !== "number" || !Number.isSafeInteger(claim.exp)) return null;
  const expiresAt = new Date(claim.exp * 1000);
  const retainUntil = new Date((claim.exp + HARBOR_JWT_CLOCK_TOLERANCE_SECONDS) * 1000);
  if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(retainUntil.getTime())) return null;
  const key = createHash("sha256").update(claim.uid).update("\0").update(claim.jti).digest("hex");
  return { claim, key, expiresAt, retainUntil, assistance: claim.tokenUse === HARBOR_TOKEN_USE };
}

export async function hasHarborLogoutReceipt(db: Pick<Prisma.TransactionClient, "harborAssistanceLoginReceipt">, key: string) {
  return (await db.harborAssistanceLoginReceipt.findUnique({
    where: { loginKey: key }, select: { retainUntil: true },
  })) !== null;
}

export async function readHarborLogin(token: string | undefined) {
  if (!token) return null;
  try {
    return harborLoginIdentity(await verifyHarborSessionToken(token));
  } catch {
    return null;
  }
}

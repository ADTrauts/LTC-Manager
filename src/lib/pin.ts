import { createHmac } from "node:crypto";

export function isValidPinFormat(pin: string): boolean {
  return /^\d{6}$/.test(pin.trim());
}

/** Deterministic digest for O(1) lookup; unique per facility when PIN is set. */
export function pinDigestForFacility(facilityId: string, pin: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required");
  }
  const normalized = pin.trim();
  return createHmac("sha256", secret).update(`${facilityId}:${normalized}`).digest("hex");
}

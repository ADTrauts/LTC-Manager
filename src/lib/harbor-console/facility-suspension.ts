import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { lockHarborStaffSession, validateHarborStaffSession, type HarborJwtPayload } from "./auth";

export const facilitySuspensionInputSchema = z.object({
  facilityId: z.string().trim().min(1).max(128),
  operation: z.enum(["suspend", "reactivate"]),
  expectedRevision: z.coerce.number().int().min(0).max(2_147_483_646),
  requestKey: z.uuid().transform((value) => value.toLowerCase()),
  reason: z.string().trim().min(1).max(1000),
  confirmationName: z.string().min(1).max(200),
  password: z.string().min(1).max(128),
});
export type FacilitySuspensionInput = z.output<typeof facilitySuspensionInputSchema>;
export type FacilitySuspensionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; passwordRejected?: boolean };

/** Only manual pause state changes. Never changes billing, staff/customer sessions or domain authority. */
export async function changeFacilityOperationsSuspension(
  db: PrismaClient, session: HarborJwtPayload, input: FacilitySuspensionInput,
): Promise<FacilitySuspensionResult> {
  if (session.staffRole !== "OWNER") return { ok: false, error: "OWNER access is required." };
  const parsed = facilitySuspensionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The suspension request is incomplete." };
  input = parsed.data;
  return db.$transaction(async (tx) => {
    const authority = await lockHarborStaffSession(session, tx);
    if (!authority.valid || authority.staff.role !== "OWNER") {
      return { ok: false as const, error: "Sign in again before changing this Facility." };
    }
    const staff = await tx.platformStaff.findUnique({ where: { id: authority.staff.id }, select: { passwordHash: true } });
    if (!staff || !(await bcrypt.compare(input.password, staff.passwordHash))) {
      return { ok: false as const, error: "Password confirmation failed.", passwordRejected: true };
    }
    // Exact concurrent retries serialize before reading their receipt. No duplicate transitions/audits.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`facility-suspension:${input.requestKey}`}, 0))`;
    const fingerprint = createHash("sha256").update(JSON.stringify([
      authority.staff.id, input.facilityId, input.operation, input.expectedRevision, input.reason, input.confirmationName,
    ])).digest("hex");
    const receipt = await tx.harborFacilitySuspensionAuditDetail.findUnique({ where: { requestKey: input.requestKey } });
    if (receipt) return receipt.fingerprint === fingerprint
      ? { ok: true as const, message: "This request was already recorded. The current status is shown below." }
      : { ok: false as const, error: "This request reference was already used. Refresh the page before continuing." };

    await tx.$queryRaw`SELECT "id" FROM "Facility" WHERE "id" = ${input.facilityId} FOR UPDATE`;
    const facility = await tx.facility.findUnique({
      where: { id: input.facilityId },
      select: { id: true, displayName: true, operationsSuspendedAt: true, operationsSuspensionRevision: true },
    });
    if (!facility) return { ok: false as const, error: "Facility not found." };
    if (input.confirmationName !== facility.displayName) return { ok: false as const, error: "Enter the Facility name exactly as displayed." };
    if (facility.operationsSuspensionRevision !== input.expectedRevision ||
        (input.operation === "suspend") === Boolean(facility.operationsSuspendedAt)) {
      return { ok: false as const, error: "The Facility status changed. Refresh and review it before continuing." };
    }
    if (!(await validateHarborStaffSession(session, tx)).valid) {
      return { ok: false as const, error: "Sign in again before changing this Facility." };
    }
    const suspendedAt = input.operation === "suspend" ? new Date() : null;
    const revision = facility.operationsSuspensionRevision + 1;
    await tx.harborAuditEvent.create({ data: {
      staffId: authority.staff.id, facilityId: facility.id,
      action: input.operation === "suspend" ? "FACILITY_SUSPEND" : "FACILITY_REACTIVATE",
      facilitySuspension: { create: {
        facilityId: facility.id, revision, requestKey: input.requestKey, fingerprint, reason: input.reason,
        previousSuspendedAt: facility.operationsSuspendedAt, suspendedAt,
      } },
    } });
    await tx.facility.update({ where: { id: facility.id }, data: {
      operationsSuspendedAt: suspendedAt, operationsSuspensionRevision: revision,
    } });
    return { ok: true as const, message: suspendedAt
      ? "Operational changes are paused. Existing data, billing and Support remain available."
      : "The manual pause is removed. Existing billing and security restrictions still apply." };
  }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
}

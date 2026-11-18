import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { FacilityProvisioningError } from "./errors";
import type { HarborProvisionInput } from "./harbor";

export function normalizeProvisionRequestKey(raw: string): string {
  const key = raw.toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key)) {
    throw new FacilityProvisioningError("INVALID_INPUT", "Start a valid provisioning request and try again.");
  }
  return key;
}

export function harborProvisionFingerprint(input: HarborProvisionInput): string {
  const evidence = input.distinctOrganization;
  return createHash("sha256").update(JSON.stringify([
    "harbor-facility-provision-v1",
    input.organizationMode === "create"
      ? ["create", input.organizationName?.trim() ?? "", input.organizationType ?? null,
          evidence?.attested === true, evidence?.verificationBasis.trim() ?? "", [...new Set(evidence?.reviewedMatchIds)].sort()]
      : ["existing", input.organizationId ?? "", input.confirmDuplicateName === true],
    input.facilityDisplayName.trim(), input.timezone.trim(), input.billingEmail.trim().toLowerCase(),
    input.administratorName.trim(), input.administratorEmail.trim().toLowerCase(), input.confirmedAdministratorId ?? null,
    input.confirmOwnership === true,
  ])).digest("hex");
}

export async function lockHarborProvisionRequest(tx: Prisma.TransactionClient, key: string) {
  await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(617885, hashtext(${key}))`;
}

export function provisionRequestConflict() {
  return new FacilityProvisioningError("PROVISION_REQUEST_CONFLICT", "This request was already completed with other details. Recover its result or start a separate request.");
}

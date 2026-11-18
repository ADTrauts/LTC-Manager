import { Prisma, type OrganizationType, type PrismaClient } from "@prisma/client";

import { lockHarborStaffSession, type HarborJwtPayload } from "@/lib/harbor-console/auth";
import { listOrganizationsByNormalizedName } from "@/lib/organization/partner-company";
import { normalizeOrganizationKey } from "@/lib/organization/types";

import {
  bootstrapFacilityCustomer,
  findExactProvisionReplay,
  findSiblingFacilitiesWithName,
  type FacilityBootstrapResult,
} from "./bootstrap";
import { FacilityProvisioningError } from "./errors";
import { isValidFacilityTimezone } from "./timezones";

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type HarborProvisionInput = {
  organizationMode: "create" | "existing";
  organizationId?: string | null;
  organizationName?: string | null;
  organizationType?: OrganizationType | null;
  facilityDisplayName: string;
  timezone: string;
  billingEmail: string;
  administratorName: string;
  administratorEmail: string;
  confirmDuplicateName?: boolean;
  distinctOrganization?: { attested: boolean; verificationBasis: string; reviewedMatchIds: readonly string[] };
};

export type HarborProvisionPreviewUser = {
  exists: boolean;
  userId: string | null;
  displayName: string;
  email: string;
};

export type HarborOrganizationMatch = {
  id: string;
  name: string;
  displayName: string | null;
  legalName: string | null;
  isActive: boolean;
};

export class HarborOrganizationNameMatchError extends FacilityProvisioningError {
  constructor(readonly proposedName: string, readonly matches: HarborOrganizationMatch[]) {
    super("ORGANIZATION_NAME_MATCH", "Review the matching Organizations. Select an active Organization or record verified evidence for a distinct one.");
  }
}

function validateVerificationBasis(raw: string): string | null {
  const basis = raw.trim();
  return basis.length >= 8 && basis.length <= 240 && !/[\u0000-\u001f\u007f]/.test(basis) ? basis : null;
}

export async function previewHarborAdministrator(
  db: DbClient,
  email: string,
): Promise<HarborProvisionPreviewUser> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) {
    throw new FacilityProvisioningError("INVALID_INPUT", "Enter a valid administrator email.");
  }
  const user = await db.user.findUnique({
    where: { email: normalized },
    select: { id: true, displayName: true, email: true, isActive: true },
  });
  if (!user) {
    return { exists: false, userId: null, displayName: "", email: normalized };
  }
  if (!user.isActive) {
    throw new FacilityProvisioningError("USER_INACTIVE", "That Vssyl account is inactive.");
  }
  return {
    exists: true,
    userId: user.id,
    displayName: user.displayName,
    email: user.email,
  };
}

export async function provisionFacilityForHarbor(
  db: PrismaClient,
  session: HarborJwtPayload,
  input: HarborProvisionInput,
): Promise<FacilityBootstrapResult & { overrideRecorded: boolean }> {
  const organizationName = input.organizationName?.trim() ?? "";
  if (input.organizationMode === "create" && (organizationName.length < 2 || organizationName.length > 200)) {
    throw new FacilityProvisioningError("INVALID_INPUT", "Organization name must be 2–200 characters.");
  }

  return db.$transaction(async (tx) => {
    if (input.organizationMode === "create") {
      // The matching read must run after this lock, with a new READ COMMITTED snapshot.
      // Only Harbor provisioning uses this lock domain. Collisions just serialize two names.
      await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(617884, hashtext(${normalizeOrganizationKey(organizationName)}))`;
    }
    const authority = await lockHarborStaffSession(session, tx);
    if (!authority.valid || authority.staff.role !== "OWNER") {
      throw new FacilityProvisioningError("FORBIDDEN", "Only a signed-in Harbor Owner can provision a Facility.");
    }

    let override: { matchedOrganizationIds: string[]; verificationBasis: string } | undefined;
    if (input.organizationMode === "create") {
      const rows = await tx.organization.findMany({
        select: { id: true, name: true, displayName: true, legalName: true, isActive: true },
        orderBy: { id: "asc" },
      });
      const matches = listOrganizationsByNormalizedName(rows, [organizationName]);
      if (matches.length) {
        const evidence = input.distinctOrganization;
        const reviewedIds = new Set(evidence?.reviewedMatchIds);
        const basis = evidence?.attested ? validateVerificationBasis(evidence.verificationBasis) : null;
        if (!basis || reviewedIds.size !== matches.length || !matches.every((match) => reviewedIds.has(match.id))) {
          throw new HarborOrganizationNameMatchError(organizationName, matches);
        }
        override = { matchedOrganizationIds: matches.map(({ id }) => id), verificationBasis: basis };
      }
    }

    const result = await bootstrapHarborProvision(tx, { ...input, organizationName });
    if (override) {
      await tx.harborAuditEvent.create({
        data: {
          staffId: authority.staff.id,
          action: "PROVISION_FACILITY",
          facilityId: result.facility.id,
          provisioningOverride: { create: { organizationId: result.organization.id, ...override } },
        },
        select: { id: true },
      });
    }
    return { ...result, overrideRecorded: !!override };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function bootstrapHarborProvision(
  db: Prisma.TransactionClient,
  input: HarborProvisionInput,
): Promise<FacilityBootstrapResult> {
  const facilityDisplayName = input.facilityDisplayName.trim();
  const billingEmail = input.billingEmail.trim().toLowerCase();
  const administratorEmail = input.administratorEmail.trim().toLowerCase();
  const administratorName = input.administratorName.trim();
  const timezone = input.timezone.trim();

  if (facilityDisplayName.length < 2) {
    throw new FacilityProvisioningError("INVALID_INPUT", "Facility name is required.");
  }
  if (!billingEmail.includes("@") || !administratorEmail.includes("@")) {
    throw new FacilityProvisioningError("INVALID_INPUT", "Valid billing and administrator emails are required.");
  }
  if (administratorName.length < 2) {
    throw new FacilityProvisioningError("INVALID_INPUT", "Administrator name is required.");
  }
  if (!isValidFacilityTimezone(timezone)) {
    throw new FacilityProvisioningError("INVALID_TIMEZONE", "Choose a valid facility timezone.");
  }

  const preview = await previewHarborAdministrator(db, administratorEmail);
  let organizationId: string | null = null;

  if (input.organizationMode === "existing") {
    await db.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${input.organizationId ?? ""} FOR SHARE`;
    const organization = await db.organization.findUnique({
      where: { id: input.organizationId ?? "" },
      select: { id: true, isActive: true },
    });
    if (!organization) {
      throw new FacilityProvisioningError("ORGANIZATION_NOT_FOUND", "Organization not found.");
    }
    if (!organization.isActive) {
      throw new FacilityProvisioningError("ORGANIZATION_INACTIVE", "Organization is inactive.");
    }
    organizationId = organization.id;
  }

  if (organizationId && preview.exists && preview.userId) {
    const replay = await findExactProvisionReplay(db, {
      organizationId,
      displayName: facilityDisplayName,
      userId: preview.userId,
    });
    if (replay) {
      const organization = await db.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, displayName: true },
      });
      return {
        organization: {
          id: organizationId,
          name: organization?.displayName?.trim() || organization?.name || "",
          created: false,
        },
        facility: { id: replay.id, displayName: replay.displayName, created: false },
        user: {
          id: preview.userId,
          email: preview.email,
          displayName: preview.displayName,
          created: false,
        },
        replayed: true,
      };
    }
  }

  if (organizationId && !input.confirmDuplicateName) {
    const siblings = await findSiblingFacilitiesWithName(db, {
      organizationId,
      displayName: facilityDisplayName,
    });
    if (siblings.length > 0) {
      throw new FacilityProvisioningError(
        "DUPLICATE_NAME",
        "A Facility with this name already exists under this Organization.",
      );
    }
  }

  return bootstrapFacilityCustomer(db, {
    organization:
      input.organizationMode === "existing" && organizationId
        ? { mode: "existing", organizationId }
        : {
            mode: "create",
            facilityName: facilityDisplayName,
            organizationName: input.organizationName,
            organizationType: input.organizationType,
          },
    facility: {
      displayName: facilityDisplayName,
      billingEmail,
      timezone,
    },
    administrator: preview.exists && preview.userId
      ? { mode: "reuse", userId: preview.userId }
      : {
          mode: "create",
          email: administratorEmail,
          displayName: administratorName,
          passwordHash: null,
          emailVerifiedAt: null,
        },
  });
}

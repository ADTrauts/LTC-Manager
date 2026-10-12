import type { OrganizationType, PrismaClient } from "@prisma/client";

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
};

export type HarborProvisionPreviewUser = {
  exists: boolean;
  userId: string | null;
  displayName: string;
  email: string;
};

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
  db: DbClient,
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
  } else if (!input.organizationName?.trim()) {
    throw new FacilityProvisioningError("INVALID_INPUT", "Organization name is required.");
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

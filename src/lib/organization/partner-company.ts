import type { PrismaClient } from "@prisma/client";

import { normalizeOrganizationKey } from "./types";

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type OrganizationNameFields = {
  id: string;
  name: string;
  displayName: string | null;
  legalName: string | null;
};

export type PartnerCompanyRecord = {
  id: string;
  name: string;
  displayName: string;
  facilityCount: number;
};

export type CreatePartnerCompanyResult =
  | { ok: true; organization: PartnerCompanyRecord }
  | {
      ok: false;
      code: "INVALID_INPUT" | "DUPLICATE";
      message: string;
      existing?: { id: string; name: string; displayName: string | null };
    };

function collapsed(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function validatePartnerCompanyName(
  raw: string,
): { ok: true; name: string } | { ok: false; message: string } {
  const name = collapsed(raw);
  if (name.length < 2 || name.length > 200) {
    return { ok: false, message: "Company name must be 2–200 characters." };
  }
  return { ok: true, name };
}

/** Match a proposed name against name, display name, or legal name. */
export function matchOrganizationByNormalizedName<T extends OrganizationNameFields>(
  rows: readonly T[],
  candidates: readonly string[],
): T | null {
  const keys = new Set(
    candidates.map((value) => normalizeOrganizationKey(value)).filter((key) => key.length > 0),
  );
  if (keys.size === 0) return null;
  return (
    rows.find((row) =>
      [row.name, row.displayName, row.legalName].some(
        (value) => value != null && keys.has(normalizeOrganizationKey(value)),
      ),
    ) ?? null
  );
}

/**
 * Create a partner company. The organization does not own a facility, and this
 * does not create an administrator, a member, a partnership, or a Department operator.
 */
export async function createPartnerCompany(
  db: DbClient,
  input: { name: string; displayName?: string | null },
): Promise<CreatePartnerCompanyResult> {
  const nameResult = validatePartnerCompanyName(input.name);
  if (!nameResult.ok) {
    return { ok: false, code: "INVALID_INPUT", message: nameResult.message };
  }

  const displayRaw = collapsed(input.displayName ?? "");
  if (displayRaw.length > 200) {
    return { ok: false, code: "INVALID_INPUT", message: "Display name must be 200 characters or fewer." };
  }
  const displayName = displayRaw.length === 0 ? nameResult.name : displayRaw;

  const rows = await db.organization.findMany({
    select: { id: true, name: true, displayName: true, legalName: true },
  });
  const existing = matchOrganizationByNormalizedName(rows, [nameResult.name, displayName]);
  if (existing) {
    const label = existing.displayName?.trim() || existing.name;
    return {
      ok: false,
      code: "DUPLICATE",
      message: `${label} already exists. Use that company instead of creating a second one.`,
      existing: { id: existing.id, name: existing.name, displayName: existing.displayName },
    };
  }

  const created = await db.organization.create({
    data: {
      name: nameResult.name,
      displayName,
      organizationType: "MANAGEMENT_COMPANY",
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      displayName: true,
      _count: { select: { facilities: true } },
    },
  });

  return {
    ok: true,
    organization: {
      id: created.id,
      name: created.name,
      displayName: created.displayName?.trim() || created.name,
      facilityCount: created._count.facilities,
    },
  };
}

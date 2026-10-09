import type { OrganizationPartnerRole, Prisma, PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getPartnerFacilitySession } from "@/lib/auth";
import { resolveFacilityAuthorization, type PartnerFacilityAuthorization } from "@/lib/partner-user-access";
import { resolvePartnerAuthorizationForPrismaRequest } from "@/lib/partner-path-request";

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Presentation preference only. Never read as authorization. */
export const PARTNER_ACTIVE_DEPARTMENT_COOKIE = "ltc_partner_active_department";

const PARTNER_SHELL_RETURN_PATHS = ["/partner", "/partner/logs", "/partner/reports", "/partner/locations"] as const;

export type PartnerShellReturnPath = (typeof PARTNER_SHELL_RETURN_PATHS)[number];

/** Allowlisted partner navigation only. Anything else stays on Partner Home. */
export function partnerShellReturnPath(value: string | null | undefined): PartnerShellReturnPath {
  return (PARTNER_SHELL_RETURN_PATHS as readonly string[]).includes(value ?? "")
    ? (value as PartnerShellReturnPath)
    : "/partner";
}

export type PartnerDepartmentChoice = {
  id: string;
  name: string;
  sortOrder: number;
};

/**
 * Request-local Path B authority for one partner Facility session.
 * Allowed Departments come from live resolution. The active Department is a
 * presentation choice inside that set.
 */
export type PartnerOperationalContext = {
  accessKind: "partner";
  userId: string;
  facilityId: string;
  partnerOrganizationId: string;
  facilityPartnerOrganizationId: string;
  assignedRole: OrganizationPartnerRole;
  facilityRoleCeiling: OrganizationPartnerRole;
  effectiveRole: OrganizationPartnerRole;
  allowedDepartmentIds: readonly string[];
  activeDepartmentId: string;
};

export type PartnerFacilityShellModel = {
  context: PartnerOperationalContext;
  facilityDisplayName: string;
  partnerOrganizationName: string;
  departments: readonly PartnerDepartmentChoice[];
};

/**
 * Canonical Department order: `sortOrder`, then `name`.
 * Same ordering as department lists in `src/lib/department-operations.ts`.
 * Not database row order, UUID order, or enum order.
 */
export function orderPartnerDepartments(
  departments: readonly PartnerDepartmentChoice[],
): PartnerDepartmentChoice[] {
  return [...departments].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  );
}

/**
 * Cookie proposes a Department. It is used only when that id is in the ordered
 * allowed list. Otherwise the first Department in canonical order is the
 * in-memory choice. This function does not write cookies.
 */
export function selectPartnerActiveDepartment(
  departments: readonly PartnerDepartmentChoice[],
  requestedDepartmentId: string | null | undefined,
): string | null {
  const ordered = orderPartnerDepartments(departments);
  if (ordered.length === 0) return null;
  if (requestedDepartmentId && ordered.some((department) => department.id === requestedDepartmentId)) {
    return requestedDepartmentId;
  }
  return ordered[0]!.id;
}

export function partnerDepartmentSwitch(
  departments: readonly PartnerDepartmentChoice[],
  requestedDepartmentId: string,
): { ok: true; departmentId: string } | { ok: false } {
  const match = orderPartnerDepartments(departments).find((department) => department.id === requestedDepartmentId);
  if (!match) return { ok: false };
  return { ok: true, departmentId: match.id };
}

export async function listSelectablePartnerDepartments(
  db: DbClient,
  input: { facilityId: string; allowedDepartmentIds: readonly string[] },
): Promise<PartnerDepartmentChoice[]> {
  if (input.allowedDepartmentIds.length === 0) return [];
  const rows = await db.department.findMany({
    where: {
      id: { in: [...input.allowedDepartmentIds] },
      facilityId: input.facilityId,
      isActive: true,
    },
    select: { id: true, name: true, sortOrder: true },
  });
  const allowed = new Set(input.allowedDepartmentIds);
  return orderPartnerDepartments(
    rows.filter((row) => allowed.has(row.id)).map((row) => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sortOrder,
    })),
  );
}

export async function resolvePartnerOperationalContext(
  db: DbClient,
  input: {
    userId: string;
    facilityId: string;
    partnerOrganizationId: string;
    facilityPartnerOrganizationId: string;
    requestedDepartmentId?: string | null;
    authorization?: PartnerFacilityAuthorization | null;
  },
): Promise<{ context: PartnerOperationalContext; departments: PartnerDepartmentChoice[] } | null> {
  const resolved =
    input.authorization ??
    (
      await resolveFacilityAuthorization(db, {
        userId: input.userId,
        facilityId: input.facilityId,
        accessKind: "partner",
        facilityPartnerOrganizationId: input.facilityPartnerOrganizationId,
      })
    ).authorization;
  if (resolved.path !== "partner") return null;
  if (
    resolved.partnerOrganizationId !== input.partnerOrganizationId ||
    resolved.facilityPartnerOrganizationId !== input.facilityPartnerOrganizationId ||
    resolved.facilityId !== input.facilityId ||
    resolved.allowedDepartmentIds.length === 0
  ) {
    return null;
  }
  const departments = await listSelectablePartnerDepartments(db, {
    facilityId: input.facilityId,
    allowedDepartmentIds: resolved.allowedDepartmentIds,
  });
  const activeDepartmentId = selectPartnerActiveDepartment(departments, input.requestedDepartmentId);
  if (!activeDepartmentId) return null;
  return {
    departments,
    context: {
      accessKind: "partner",
      userId: input.userId,
      facilityId: input.facilityId,
      partnerOrganizationId: resolved.partnerOrganizationId,
      facilityPartnerOrganizationId: resolved.facilityPartnerOrganizationId,
      assignedRole: resolved.assignedRole,
      facilityRoleCeiling: resolved.facilityRoleCeiling,
      effectiveRole: resolved.effectiveRole,
      allowedDepartmentIds: departments.map((department) => department.id),
      activeDepartmentId,
    },
  };
}

const loadPartnerFacilityShellForRequest = cache(async (): Promise<PartnerFacilityShellModel | null> => {
  const session = await getPartnerFacilitySession();
  if (!session) return null;
  const resolved = await resolvePartnerAuthorizationForPrismaRequest(
    session.uid,
    session.facilityId,
    session.facilityPartnerOrganizationId,
  );
  if (resolved.authorization.path !== "partner") return null;
  const requested = (await cookies()).get(PARTNER_ACTIVE_DEPARTMENT_COOKIE)?.value ?? null;
  const { prisma } = await import("@/lib/prisma");
  const operational = await resolvePartnerOperationalContext(prisma, {
    userId: session.uid,
    facilityId: session.facilityId,
    partnerOrganizationId: session.partnerOrganizationId,
    facilityPartnerOrganizationId: session.facilityPartnerOrganizationId,
    requestedDepartmentId: requested,
    authorization: resolved.authorization,
  });
  if (!operational) return null;
  const [facility, organization] = await Promise.all([
    prisma.facility.findUnique({
      where: { id: operational.context.facilityId },
      select: { displayName: true },
    }),
    prisma.organization.findUnique({
      where: { id: operational.context.partnerOrganizationId },
      select: { name: true, displayName: true },
    }),
  ]);
  return {
    context: operational.context,
    facilityDisplayName: facility?.displayName ?? "Facility",
    partnerOrganizationName: organization?.displayName?.trim() || organization?.name || "your Organization",
    departments: operational.departments,
  };
});

/** Partner shell for this request. Invalid Path B redirects to the certified exit. */
export async function loadPartnerFacilityShell(): Promise<PartnerFacilityShellModel> {
  const shell = await loadPartnerFacilityShellForRequest();
  if (!shell) redirect("/partner/exit");
  return shell;
}

export async function requirePartnerOperationalContext(): Promise<PartnerOperationalContext> {
  const shell = await loadPartnerFacilityShell();
  return shell.context;
}

import type { Prisma, PrismaClient, RoleKey } from "@prisma/client";
import { cache } from "react";

import {
  isPartnerFacilitySession,
  type AuthKind,
  type FacilitySession,
  type PartnerFacilitySession,
} from "@/lib/auth";
import { loadCurrentOperatorsForFacilityDepartments } from "@/lib/department-operators/service";
import { organizationDisplayLabel } from "@/lib/department-operators/types";
import { resolveDepartmentMembershipIds } from "@/lib/employee-membership/department";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { resolvePartnerAuthorizationForPrismaRequest } from "@/lib/partner-path-request";
import { resolveFacilityAuthorization } from "@/lib/partner-user-access";
import { prisma } from "@/lib/prisma";

import {
  canReadComplianceRecordsInMode,
  decideDepartmentAccess,
  departmentAccessReason,
  type DepartmentAccess,
  type DepartmentSessionKind,
} from "./access";
import { deriveLedDepartmentIds } from "./led-departments";
import {
  loadAcceptedVendorHeads,
  vendorAccountIsHead,
  vendorHeadAcceptedForPeriod,
} from "./vendor-heads";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type DepartmentAccessSession = FacilitySession | PartnerFacilitySession;

type WorkforceFacts = {
  employeeId: string;
  roleType: RoleKey;
  primaryDepartmentId: string | null;
  memberDepartmentIds: string[];
};

type ViewerFacts = {
  sessionKind: DepartmentSessionKind;
  isFacilityAdministrator: boolean;
  workforce: WorkforceFacts | null;
  /** Vendor sessions: Departments in the partner's authorized scope. */
  vendorDepartmentIds: readonly string[];
  vendorOrganizationId: string | null;
};

async function loadWorkforceFacts(
  db: DbClient,
  input: { facilityId: string; authKind: AuthKind; uid: string },
): Promise<WorkforceFacts | null> {
  if (!input.uid.trim()) return null;
  const employee = await db.employee.findFirst({
    where:
      input.authKind === "employee"
        ? { id: input.uid, facilityId: input.facilityId }
        : { userId: input.uid, facilityId: input.facilityId },
    select: {
      id: true,
      roleType: true,
      primaryDepartmentId: true,
      employeeDepartments: { select: { departmentId: true } },
    },
  });
  if (!employee) return null;
  return {
    employeeId: employee.id,
    roleType: employee.roleType,
    primaryDepartmentId: employee.primaryDepartmentId,
    memberDepartmentIds: resolveDepartmentMembershipIds(employee),
  };
}

const loadWorkforceFactsForRequest = cache(
  (facilityId: string, authKind: AuthKind, uid: string) =>
    loadWorkforceFacts(prisma, { facilityId, authKind, uid }),
);

async function loadVendorDepartmentIds(
  db: DbClient,
  session: PartnerFacilitySession,
): Promise<readonly string[]> {
  const result =
    db === prisma
      ? await resolvePartnerAuthorizationForPrismaRequest(
          session.uid,
          session.facilityId,
          session.facilityPartnerOrganizationId,
        )
      : await resolveFacilityAuthorization(db, {
          userId: session.uid,
          facilityId: session.facilityId,
          accessKind: "partner",
          facilityPartnerOrganizationId: session.facilityPartnerOrganizationId,
        });
  const authorization = result.authorization;
  if (
    authorization.path !== "partner" ||
    authorization.partnerOrganizationId !== session.partnerOrganizationId
  ) {
    return [];
  }
  return authorization.allowedDepartmentIds;
}

async function loadViewerFacts(
  db: DbClient,
  session: DepartmentAccessSession,
  facilityId: string,
): Promise<ViewerFacts> {
  const sameFacility = session.facilityId === facilityId;

  if (isPartnerFacilitySession(session)) {
    return {
      sessionKind: "vendor",
      isFacilityAdministrator: false,
      workforce: null,
      vendorDepartmentIds: sameFacility ? await loadVendorDepartmentIds(db, session) : [],
      vendorOrganizationId: session.partnerOrganizationId,
    };
  }

  if (session.authKind === "harbor_staff") {
    return {
      sessionKind: "harbor",
      isFacilityAdministrator: false,
      workforce: null,
      vendorDepartmentIds: [],
      vendorOrganizationId: null,
    };
  }

  const workforce = !sameFacility
    ? null
    : db === prisma
      ? await loadWorkforceFactsForRequest(facilityId, session.authKind, session.uid)
      : await loadWorkforceFacts(db, { facilityId, authKind: session.authKind, uid: session.uid });

  return {
    sessionKind: "internal",
    isFacilityAdministrator: sameFacility && isFacilityAdministratorRole(session.role),
    workforce,
    vendorDepartmentIds: [],
    vendorOrganizationId: null,
  };
}

/**
 * Access for each requested Department of the facility, on the facility service date of `now`.
 * Departments outside the facility are omitted.
 */
export async function resolveDepartmentAccessMap(
  db: DbClient,
  session: DepartmentAccessSession,
  input: { facilityId: string; departmentIds: readonly string[]; now?: Date },
): Promise<Map<string, DepartmentAccess>> {
  const requested = [...new Set(input.departmentIds)];
  if (requested.length === 0) return new Map();

  const [viewer, departments] = await Promise.all([
    loadViewerFacts(db, session, input.facilityId),
    db.department.findMany({
      where: { facilityId: input.facilityId, id: { in: requested } },
      select: { id: true, headEmployeeId: true },
    }),
  ]);
  if (departments.length === 0) return new Map();

  const operators = await loadCurrentOperatorsForFacilityDepartments(db, {
    facilityId: input.facilityId,
    departmentIds: departments.map((department) => department.id),
    now: input.now,
  });
  const enforcementEnabled = isContractedDepartmentAuthorityEnabled();
  const acceptedHeads = await loadAcceptedVendorHeads(db, {
    departmentIds: departments.map((department) => department.id),
  });

  const workforce = viewer.workforce;
  const ledDepartmentIds = new Set(
    workforce
      ? deriveLedDepartmentIds({
          headedDepartmentIds: departments
            .filter((department) => department.headEmployeeId === workforce.employeeId)
            .map((department) => department.id),
          roleType: workforce.roleType,
          primaryDepartmentId: workforce.primaryDepartmentId,
        })
      : [],
  );
  const memberDepartmentIds = new Set(
    viewer.sessionKind === "vendor" ? viewer.vendorDepartmentIds : workforce?.memberDepartmentIds ?? [],
  );
  const result = new Map<string, DepartmentAccess>();
  for (const department of departments) {
    const operator = operators.get(department.id) ?? null;
    const operatingModel = operator?.operatingModel ?? "FACILITY_OPERATED";
    const operatorName =
      operator && operatingModel === "CONTRACTED"
        ? organizationDisplayLabel(operator.relationship.organization)
        : null;
    const acceptedHead = acceptedHeads.get(department.id);
    const vendorHeadAccepted = vendorHeadAcceptedForPeriod(
      acceptedHead,
      operator?.relationship.id ?? null,
    );
    const isMember = memberDepartmentIds.has(department.id);
    const isHead =
      ledDepartmentIds.has(department.id) ||
      vendorAccountIsHead({
        sessionKind: viewer.sessionKind,
        sessionUserId: session.uid,
        vendorHeadAccepted,
        assigneeUserId: acceptedHead?.assigneeUserId ?? null,
      });
    const mode = decideDepartmentAccess({
      enforcementEnabled,
      sessionKind: viewer.sessionKind,
      operatingModel,
      vendorHeadAccepted,
      isFacilityAdministrator: viewer.isFacilityAdministrator,
      isMember,
      isHead,
      vendorOperatesDepartment:
        viewer.vendorOrganizationId !== null &&
        operator?.relationship.organizationId === viewer.vendorOrganizationId,
    });
    result.set(department.id, {
      departmentId: department.id,
      mode,
      canReadComplianceRecords: canReadComplianceRecordsInMode(mode, viewer.isFacilityAdministrator),
      operatingModel,
      operatorName,
      operatorPeriodId: operator?.relationship.id ?? null,
      vendorHeadAccepted,
      isMember,
      isHead,
      reason: departmentAccessReason(mode, operatorName),
    });
  }
  return result;
}

/**
 * CDA-03 view fix: the Facility Administrator views every self-operated Department of their
 * facility, whatever the enforcement flag says. It grants viewing only, never a write.
 */
export async function resolveFacilityAdministratorView(
  db: DbClient,
  session: DepartmentAccessSession,
  input: { facilityId: string; departmentId: string; now?: Date },
): Promise<boolean> {
  if (isPartnerFacilitySession(session) || session.authKind === "harbor_staff") return false;
  if (session.facilityId !== input.facilityId || !isFacilityAdministratorRole(session.role)) {
    return false;
  }
  const [department, operators] = await Promise.all([
    db.department.findFirst({
      where: { id: input.departmentId, facilityId: input.facilityId },
      select: { id: true },
    }),
    loadCurrentOperatorsForFacilityDepartments(db, {
      facilityId: input.facilityId,
      departmentIds: [input.departmentId],
      now: input.now,
    }),
  ]);
  if (!department) return false;
  return (operators.get(input.departmentId)?.operatingModel ?? "FACILITY_OPERATED") === "FACILITY_OPERATED";
}

/** Null when the Department is not part of the facility. */
export async function resolveDepartmentAccess(
  db: DbClient,
  session: DepartmentAccessSession,
  input: { facilityId: string; departmentId: string; now?: Date },
): Promise<DepartmentAccess | null> {
  const map = await resolveDepartmentAccessMap(db, session, {
    facilityId: input.facilityId,
    departmentIds: [input.departmentId],
    now: input.now,
  });
  return map.get(input.departmentId) ?? null;
}

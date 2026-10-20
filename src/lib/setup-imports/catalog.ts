import { loadFacilityStructureCatalog } from "@/lib/bulk-import/facility-structure-execute";
import { Prisma } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { loadCustomerOperableDepartments } from "@/lib/department-products/load-facility-catalog";
import { loadAssetImportCatalog } from "@/lib/bulk-import/asset-import-execute";
import { resolveAssetOperationsAuthority } from "@/lib/asset-operations/authority";
import type { Db } from "./authority";
import type { ImportSource } from "./contract";

export const employeeInclude = { employeeDepartments: true, teamMemberships: true, departmentJobRoles: true, user: { select: { id: true, email: true, isActive: true, sessionVersion: true, passwordHash: true, emailVerifiedAt: true, facilityAccesses: { include: { rolePeriods: true } } } } } satisfies Prisma.EmployeeInclude;
export async function loadCatalog(db: Db, session: FacilitySession, source: ImportSource) {
  const facilityId = session.facilityId;
  const emails = source.rows.map(r => r.values.email?.toLowerCase()).filter((x): x is string => Boolean(x));
  const ids = source.rows.map(r => r.values.employeeId).filter((x): x is string => Boolean(x));
  // Exact normalized equality preserves ambiguous case variants without ILIKE's
  // global scan/pattern semantics. Functional indexes bound Serializable reads.
  const accountMatches = emails.length ? await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "User" WHERE lower("email") = ANY(${emails}::text[])
  `) : [];
  const emailMatches = emails.length ? await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Employee" WHERE "facilityId"=${facilityId} AND lower("email") = ANY(${emails}::text[])
  `) : [];
  const accountIds = accountMatches.map(row => row.id);
  const [facility, departments, employees, users, teams, jobRoles, jobTitles, units, spaces, unitResponsibilities, spaceResponsibilities, roles] = await Promise.all([
    db.facility.findUniqueOrThrow({ where: { id: facilityId }, select: { id: true, organizationId: true } }),
    loadCustomerOperableDepartments(db,facilityId),
    db.employee.findMany({ where: { facilityId, OR: [{ id: { in: [...ids,...emailMatches.map(row => row.id)] } }, { userId: { in: accountIds } }] }, include: employeeInclude }),
    db.user.findMany({ where: { id: { in: accountIds } }, select: { id: true, email: true, displayName: true, isActive: true, sessionVersion: true, passwordHash: true, emailVerifiedAt: true, facility: { select: { organizationId: true } }, facilityAccesses: { include: { facility: { select: { organizationId: true } }, rolePeriods: true } } } }),
    db.departmentTeam.findMany({ where: { facilityId }, select: { id: true, departmentId: true, status: true } }),
    db.departmentJobRole.findMany({ where: { facilityId }, select: { id: true, departmentId: true, status: true } }),
    db.jobTitle.findMany({ where: { facilityId }, select: { id: true, isActive: true } }),
    db.unit.findMany({ where: { facilityId }, select: { id: true, name: true, isActive: true, hierarchyRole: true } }),
    db.unitSpace.findMany({ where: { facilityId }, select: { id: true, unitId: true, name: true, isActive: true } }),
    db.unitDepartmentResponsibility.findMany({ where: { unit: { facilityId } }, orderBy: { id: "asc" } }),
    db.unitSpaceResponsibility.findMany({ where: { space: { facilityId } }, orderBy: { id: "asc" } }),
    db.role.findMany({ where: { isActive: true }, select: { key: true } }),
  ]);
  // Credentials never enter planner facts, reviews, receipts, UI or exports.
  const accountFacts = <T extends { passwordHash: string | null; emailVerifiedAt: Date | null }>(user: T) => {
    const { passwordHash, ...rest } = user;
    return { ...rest, hasPassword: Boolean(passwordHash) };
  };
  let assets: Awaited<ReturnType<typeof loadAssetImportCatalog>> | null = null;
  const assetAuthority: Record<string,boolean> = {};
  if (source.dataset === "assets") {
    assets = await loadAssetImportCatalog(db,facilityId,source.rows.map(r => r.values.assetCode).filter(Boolean));
    for (const d of departments) assetAuthority[d.id] = (await resolveAssetOperationsAuthority(session,facilityId,d.id,db)).canManageAssets;
  }
  const structure = source.dataset === "locations" ? await loadFacilityStructureCatalog(db,facilityId) : null;
  if (structure) structure.departments = departments;
  return { structure, facility, departments, employees: employees.map(e => ({ ...e, pinDigest: undefined, hasPin: Boolean(e.pinDigest), user: e.user ? accountFacts(e.user) : null })), users: users.map(accountFacts), teams, jobRoles, jobTitles, units, spaces, unitResponsibilities, spaceResponsibilities, roles, assets, assetAuthority };
}
export type Catalog = Awaited<ReturnType<typeof loadCatalog>>;

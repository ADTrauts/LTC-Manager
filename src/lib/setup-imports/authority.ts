import { Prisma, type PrismaClient } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/access";
import { validateSessionAuthority } from "@/lib/session-revocation";
import { ImportError, type SourceRow, type Dataset } from "./contract";
export type Db = PrismaClient | Prisma.TransactionClient;

export function requireImportSession(session: FacilitySession, expectedFacilityId: string, dataset: Dataset = "workforce") {
  if (session.facilityId !== expectedFacilityId) throw new ImportError("Facility changed. Reload and preview in the intended Facility.");
  if (!["user","harbor_staff"].includes(session.authKind!) || session.authMethod !== "PASSWORD" || session.scopeKind !== "facility" || !(dataset === "assets" ? hasAtLeastRole(session.role,"SUPERVISOR") : session.role === "FACILITY_ADMINISTRATOR") || ("accessKind" in session && session.accessKind === "partner") || !Number.isInteger(session.sessionVersion)) {
    throw new ImportError("Bulk setup requires an internal Facility Administrator password session or an authorized Console Facility work session.");
  }
}
export async function liveActor(db: Db, session: FacilitySession, expectedFacilityId = session.facilityId, dataset: Dataset = "workforce") {
  requireImportSession(session,expectedFacilityId,dataset);
  const authority = await validateSessionAuthority(session,db);
  if (!authority.valid) throw new ImportError("Your authority or session changed. Sign in and preview again.");
  if (dataset === "assets" && session.authKind === "user" && (session.primaryDepartmentId ?? null) !== authority.effectiveDepartmentId) throw new ImportError("Department authority changed. Re-enter the canonical Department context and preview again.");
  const role = session.authKind === "harbor_staff" ? (await db.platformStaff.findUniqueOrThrow({ where: { id: session.uid }, select: { role: true } })).role : session.role;
  return { kind: session.authKind!, id: session.uid, role, facilityId: session.facilityId, departmentContextId: authority.effectiveDepartmentId, authMethod: session.authMethod, sessionVersion: session.sessionVersion };
}
export async function lockAuthority(tx: Prisma.TransactionClient, session: FacilitySession, dataset: Dataset) {
  if (session.authKind === "harbor_staff") {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PlatformStaff" WHERE "id"=${session.uid} FOR SHARE`);
  } else {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id"=${session.uid} FOR SHARE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Employee" WHERE "userId"=${session.uid} AND "facilityId"=${session.facilityId} FOR SHARE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Role" WHERE "key"=${session.role}::"RoleKey" FOR SHARE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "UserFacilityAccess" WHERE "userId"=${session.uid} AND "facilityId"=${session.facilityId} FOR SHARE`);
    await tx.$queryRaw(Prisma.sql`SELECT p."id" FROM "UserFacilityRolePeriod" p JOIN "UserFacilityAccess" a ON a."id"=p."userFacilityAccessId" WHERE a."userId"=${session.uid} AND a."facilityId"=${session.facilityId} FOR SHARE OF p`);
  }
  return liveActor(tx,session,session.facilityId,dataset);
}
export async function lockFacility(tx: Prisma.TransactionClient, facilityId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id"=${facilityId} FOR UPDATE`);
}
/** All dependency checks and writes use this transaction. Canonical billing and
 * workforce creation share the Facility lock; row locks protect independent edits. */
export async function lockDependencies(tx: Prisma.TransactionClient, facilityId: string, rows: SourceRow[]) {
  for (const r of [...rows].sort((a,b) => (a.values.email || a.values.employeeId || "").localeCompare(b.values.email || b.values.employeeId || ""))) {
    const email = r.values.email?.toLowerCase() || "";
    if (email) {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE lower("email")=${email} ORDER BY "id" FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Employee" WHERE "facilityId"=${facilityId} AND lower("email")=${email} ORDER BY "id" FOR UPDATE`);
    }
    if (r.values.employeeId) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Employee" WHERE "facilityId"=${facilityId} AND "id"=${r.values.employeeId} FOR UPDATE`);
  }
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Department" WHERE "facilityId"=${facilityId} FOR SHARE`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Unit" WHERE "facilityId"=${facilityId} FOR SHARE`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "UnitSpace" WHERE "facilityId"=${facilityId} FOR SHARE`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "DepartmentTeam" WHERE "facilityId"=${facilityId} FOR SHARE`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "DepartmentJobRole" WHERE "facilityId"=${facilityId} FOR SHARE`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "JobTitle" WHERE "facilityId"=${facilityId} FOR SHARE`);
}

import { executeFacilityStructurePlanInTransaction, loadFacilityStructureCatalog } from "@/lib/bulk-import/facility-structure-execute";
import type { Prisma, RoleKey, EmploymentType, UnitDepartmentKind, AssetCriticality } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { onboardFacilityEmployee } from "@/lib/employee-identity/onboard";
import { syncEmployeeOrganization } from "@/lib/employee-membership/organization";
import { savePhysicalResponsibility } from "@/lib/facility-builder/responsibility-service";
import { createAsset } from "@/lib/asset-operations/asset-service";
import type { AssetOperationalStatus } from "@/lib/asset-operations";
import { employeeInclude } from "./catalog";
import { ImportError, type PlanRow } from "./contract";

export async function executeRow(tx: Prisma.TransactionClient, session: FacilitySession, row: PlanRow): Promise<{ status: "committed" | "reused"; targetIds: Record<string,string>; message: string }> {
  const op = row.operation; if (!op) throw new ImportError(row.message);
  const facilityId = session.facilityId;
  if (op.kind === "locations") {
    const plan = op.locationPlan!;
    await executeFacilityStructurePlanInTransaction(tx,facilityId,plan);
    const catalog = await loadFacilityStructureCatalog(tx,facilityId);
    const place = plan.rows[0]!;
    const building = place.buildingName ? catalog.units.filter(u => u.hierarchyRole === "BUILDING" && u.name.toLowerCase() === place.buildingName.toLowerCase()) : [];
    const floors = catalog.units.filter(u => u.hierarchyRole === "FLOOR" && u.name.toLowerCase() === place.floorName.toLowerCase() && u.parentUnitId === (building[0]?.id ?? null));
    const units = catalog.units.filter(u => u.parentUnitId === floors[0]?.id && u.name.toLowerCase() === place.neighborhoodName.toLowerCase());
    const rooms = catalog.spaces.filter(u => u.unitId === units[0]?.id && u.name.toLowerCase() === place.spaceName.toLowerCase());
    const id = place.intent === "location" ? rooms[0]?.id : place.intent === "neighborhood" ? units[0]?.id : floors[0]?.id;
    if (!id || floors.length !== 1 || (place.intent !== "floor" && units.length !== 1) || (place.intent === "location" && rooms.length !== 1) || building.length > 1) throw new ImportError("Canonical location receipt is ambiguous.");
    return { status: row.action === "reuse" ? "reused" : "committed", targetIds: { locationId: id, locationType: place.intent === "location" ? "ROOM" : "UNIT", floorId: floors[0]!.id, ...(units[0] ? { unitId: units[0].id } : {}), ...(rooms[0] ? { spaceId: rooms[0].id } : {}) }, message: "Canonical Facility hierarchy committed/reused; no duplicate Department-specific place or publication." };
  }
  if (op.kind === "workforce") {
    if (row.action === "reuse") return { status: "reused", targetIds: { employeeId: op.employeeId!, userId: op.userId! }, message: "Reused existing Employee; no credentials, HR, authority or relationships changed." };
    const made = await onboardFacilityEmployee(tx,{ facilityId, actorUserId: session.authKind === "user" ? session.uid : null, firstName: op.firstName!, lastName: op.lastName!, email: op.email!, phone: op.phone, roleType: op.roleType as RoleKey, employmentType: op.employmentType as EmploymentType, status: "ACTIVE", pendingPinEnrollment: true, confirmExistingUser: Boolean(op.userId) });
    await syncEmployeeOrganization(tx,{ employeeId: made.employeeId, facilityId, primaryDepartmentId: op.departmentId!, additionalDepartmentIds: [], jobTitleId: op.jobTitleId ?? null, teamMemberships: op.teamId ? [{ teamId: op.teamId, isPrimary: true }] : [], jobRoleByDepartmentId: op.jobRoleId ? new Map([[op.departmentId!,op.jobRoleId]]) : undefined });
    return { status: "committed", targetIds: { employeeId: made.employeeId, userId: made.userId }, message: `Created linked Employee; ${made.reusedExistingUser ? "reused the explicitly confirmed global account" : "account activation pending"}. Eligible PIN enrollment remains separate; no credential generated.` };
  }
  if (op.kind === "employee_departments") {
    const e = await tx.employee.findFirstOrThrow({ where: { id: op.employeeId, facilityId }, include: employeeInclude });
    if (row.action === "reuse") return { status: "reused", targetIds: { employeeId: e.id, departmentId: op.departmentId! }, message: "Relationship already exists; preserved other memberships and settings." };
    const primary = op.membership === "PRIMARY" ? op.departmentId! : e.primaryDepartmentId;
    const additional = [...new Set([...e.employeeDepartments.map(x => x.departmentId), ...(op.departmentId !== primary ? [op.departmentId!] : [])])];
    const teams = e.teamMemberships.map(t => ({ teamId: t.teamId, isPrimary: t.isPrimary }));
    if (op.teamId && !teams.some(t => t.teamId === op.teamId)) teams.push({ teamId: op.teamId, isPrimary: op.teamPrimary ?? false });
    await syncEmployeeOrganization(tx,{ employeeId: e.id, facilityId, primaryDepartmentId: primary, additionalDepartmentIds: additional, jobTitleId: e.jobTitleId, teamMemberships: teams, jobRoleByDepartmentId: op.jobRoleId ? new Map([[op.departmentId!,op.jobRoleId]]) : undefined });
    return { status: "committed", targetIds: { employeeId: e.id, departmentId: op.departmentId! }, message: "Added the reviewed relationship; unprovided relationships and HR fields preserved." };
  }
  if (op.kind === "department_locations") {
    if (row.action !== "reuse") await savePhysicalResponsibility(tx,{ facilityId, departmentId: op.departmentId!, locationId: op.locationId!, locationType: op.locationType as "UNIT" | "ROOM", kind: op.responsibilityKind as UnitDepartmentKind | undefined, preserveExisting: true });
    return { status: row.action === "reuse" ? "reused" : "committed", targetIds: { locationId: op.locationId!, departmentId: op.departmentId! }, message: "Shared the canonical physical place; other responsibilities/settings preserved. Nothing published." };
  }
  if (row.action === "reuse") {
    return { status: "reused", targetIds: { assetId: op.targetKey }, message: "Reused existing Asset identity; no Asset fields or status changed." };
  }
  const a = op.asset!;
  const asset = await createAsset(session,{ client: tx, facilityId, departmentId: op.departmentId!, unitId: op.unitId!, spaceId: op.spaceId, ...a, criticality: a.criticality as AssetCriticality, status: a.status as AssetOperationalStatus });
  return { status: "committed", targetIds: { assetId: asset.id }, message: "Registered Asset through the canonical owner; no operational Work/evidence/publication created." };
}

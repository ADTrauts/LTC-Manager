import type { Prisma, PrismaClient, UnitDepartmentKind } from "@prisma/client";
type Db = PrismaClient | Prisma.TransactionClient;

/** Canonical physical responsibility writer shared by Facility Builder and imports.
 * This never creates or reclassifies a physical place, licenses or publishes. */
export async function savePhysicalResponsibility(db: Db, input: {
  facilityId: string; departmentId: string; locationType: "UNIT" | "ROOM"; locationId: string;
  kind?: UnitDepartmentKind; capabilities?: string[]; riskLevel?: string | null;
  cleaningFrequency?: string | null; inspectionFrequency?: string | null; preserveExisting?: boolean;
}) {
  const department = await db.department.findFirst({ where: { id: input.departmentId, facilityId: input.facilityId, isActive: true }, select: { id: true } });
  if (!department) throw new Error("Department not found.");
  if (input.locationType === "UNIT") {
    const unit = await db.unit.findFirst({ where: { id: input.locationId, facilityId: input.facilityId }, select: { id: true } });
    if (!unit) throw new Error("Unit not found in this Facility.");
    const key = { unitId: unit.id, departmentId: department.id };
    const existing = await db.unitDepartmentResponsibility.findUnique({ where: { unitId_departmentId: key } });
    if (existing && input.preserveExisting) return existing;
    const data = { kind: input.kind ?? "PRIMARY", capabilities: input.capabilities ?? [], riskLevel: input.riskLevel ?? null, cleaningFrequency: input.cleaningFrequency ?? null, inspectionFrequency: input.inspectionFrequency ?? null };
    return db.unitDepartmentResponsibility.upsert({ where: { unitId_departmentId: key }, create: { ...key,...data }, update: data });
  }
  const room = await db.unitSpace.findFirst({ where: { id: input.locationId, facilityId: input.facilityId }, select: { id: true } });
  if (!room) throw new Error("Room not found in this Facility.");
  const key = { spaceId: room.id, departmentId: department.id };
  const existing = await db.unitSpaceResponsibility.findUnique({ where: { spaceId_departmentId: key } });
  if (existing && input.preserveExisting) return existing;
  return db.unitSpaceResponsibility.upsert({ where: { spaceId_departmentId: key }, create: { ...key, capabilities: input.capabilities ?? [] }, update: { capabilities: input.capabilities ?? [] } });
}

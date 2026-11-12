import { tsImport } from "tsx/esm/api";
import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

export async function prepareAssignmentBoardRoom(db, { facilityId, departmentId, employeeId, tag }) {
  assertDisposableDatabaseUrl(process.env.VERIFY_DATABASE_URL);
  const structure = await tsImport("../../src/lib/bulk-import/facility-structure-execute.ts", import.meta.url);
  const { savePhysicalResponsibility } = await tsImport(
    "../../src/lib/facility-builder/responsibility-service.ts", import.meta.url,
  );
  const roomName = `Assignment Room ${tag}`;
  const csv = `floor,neighborhood,locationName,locationType,roomNumber\nCertification Floor,Board ${tag},${roomName},Servery,001\n`;
  const plan = structure.buildFacilityStructurePlanFromCsv(
    csv, await structure.loadFacilityStructureCatalog(db, facilityId), "assignment-board.csv",
  );
  if (!plan.ok || !plan.plan.canConfirm) throw Error("Could not prepare the Assignment board fixture Room");
  await structure.executeFacilityStructurePlan(db, facilityId, plan.plan);
  const room = await db.unitSpace.findFirstOrThrow({
    where: { facilityId, name: roomName }, select: { id: true, unitId: true, name: true },
  });
  for (const [locationType, locationId] of [["UNIT", room.unitId], ["ROOM", room.id]]) {
    await savePhysicalResponsibility(db, { facilityId, departmentId, locationType, locationId, preserveExisting: true });
  }
  await db.employeeOperationalRoleQualification.upsert({
    where: { employeeId_departmentId_roleKey: { employeeId, departmentId, roleKey: "SERVER" } },
    update: { status: "ACTIVE", revokedAt: null },
    create: { facilityId, departmentId, employeeId, roleKey: "SERVER" },
  });
  return room;
}

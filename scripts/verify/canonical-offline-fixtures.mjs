/** Current SPACE / Location Function / published Period fixture. Disposable only.
 * Administrative binding, customer publication and worker execution stay separate. */
import { createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import { tsImport } from "tsx/esm/api";
import { activateFixtureAccount } from "./fixture-account.mjs";
import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

export async function prepareCanonicalOfflineFixture(db, { facilityId, departmentId, tag, pin, extraWorkItems = 0, extraKeyTimes = 0 }) {
  assertDisposableDatabaseUrl(process.env.VERIFY_DATABASE_URL);
  const secret = process.env.AUTH_SECRET, password = process.env.SEED_DEMO_PASSWORD;
  if (!secret || !password) throw Error("Synthetic fixture credentials required");
  const { onboardFacilityEmployee } = await tsImport("../../src/lib/employee-identity/onboard.ts", import.meta.url);
  const { syncEmployeeOrganization } = await tsImport("../../src/lib/employee-membership/organization.ts", import.meta.url);
  const structure = await tsImport("../../src/lib/bulk-import/facility-structure-execute.ts", import.meta.url);
  const { savePhysicalResponsibility } = await tsImport("../../src/lib/facility-builder/responsibility-service.ts", import.meta.url);
  const { bindLocationFunction, publishLocationFunctionDraft } = await tsImport("../../src/lib/department-administration/profile-service.ts", import.meta.url);
  const { getFacilityServiceDate, toServiceDateKey } = await tsImport("../../src/lib/operational-time/index.ts", import.meta.url);
  const facility = await db.facility.findUniqueOrThrow({ where: { id: facilityId } });
  const effectiveFrom = toServiceDateKey(getFacilityServiceDate(facility.timezone, new Date()));
  const cycles = await tsImport("../../src/lib/operational-cycles/cycle-service.ts", import.meta.url);
  const work = await tsImport("../../src/lib/department-work/work-plan-service.ts", import.meta.url);
  const csv = `floor,neighborhood,locationName,locationType,roomNumber\nCertification Floor,Canonical ${tag},Food Service ${tag},Servery,001\n`;
  const plan = structure.buildFacilityStructurePlanFromCsv(csv, await structure.loadFacilityStructureCatalog(db, facilityId), "canonical-offline.csv");
  if (!plan.ok || !plan.plan.canConfirm) throw Error(JSON.stringify(plan));
  await structure.executeFacilityStructurePlan(db, facilityId, plan.plan);
  const room = await db.unitSpace.findFirstOrThrow({ where: { facilityId, name: `Food Service ${tag}` }, include: { unit: true } });
  if (room.unit.hierarchyRole !== "NEIGHBORHOOD" || room.unit.unitType !== "OTHER") throw Error("Expected canonical physical Neighborhood, never a legacy SERVERY override");
  for (const [locationType, locationId] of [["UNIT", room.unitId], ["ROOM", room.id]]) {
    await savePhysicalResponsibility(db, { facilityId, departmentId, locationType, locationId, preserveExisting: true });
  }
  const people = {};
  for (const [key, roleKey] of [["manager", "GM"], ["worker", "STAFF"], ["secondWorker", "STAFF"]]) {
    const email = `canonical-${tag}-${key.toLowerCase()}@example.test`;
    const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
    const user = await db.user.upsert({ where: { email }, update: {}, create: { email, displayName: `Canonical ${key}`, facilityId, primaryDepartmentId: departmentId, roleId: role.id, passwordHash: await bcrypt.hash(password, 4) } });
    await activateFixtureAccount(db, user, { facilityId, roleKey });
    let employee = await db.employee.findUnique({ where: { facilityId_userId: { facilityId, userId: user.id } } });
    if (!employee) {
      const made = await db.$transaction(tx => onboardFacilityEmployee(tx, { facilityId, actorUserId: user.id, firstName: "Canonical", lastName: key, email, roleType: roleKey, employmentType: "FULL_TIME", status: "ACTIVE", confirmExistingUser: true,
        pinDigest: key === "worker" ? createHmac("sha256", secret).update(`${facilityId}:${pin}`).digest("hex") : roleKey === "STAFF" ? createHmac("sha256", secret).update(`${facilityId}:${pin.slice(0,-1)}9`).digest("hex") : null,
        extras: { primaryUnitId: room.unitId } }));
      employee = await db.employee.findUniqueOrThrow({ where: { id: made.employeeId } });
    }
    await db.$transaction(tx => syncEmployeeOrganization(tx, { facilityId, employeeId: employee.id, primaryDepartmentId: departmentId, additionalDepartmentIds: [], jobTitleId: null, teamMemberships: [] }));
    people[key] = { userId: user.id, employeeId: employee.id, email };
  }
  const manager = people.manager;
  const session = { uid: manager.userId, authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", role: "GM", facilityId, primaryDepartmentId: departmentId, name: "Canonical manager", email: manager.email, sessionVersion: 0 };
  const actor = { userId: manager.userId, role: "GM", facilityId, authMethod: "PASSWORD" };
  await bindLocationFunction(actor, { facilityId, departmentId, unitSpaceId: room.id, functionKey: "food_service_area" });
  const profile = await publishLocationFunctionDraft(actor, { facilityId, departmentId });
  const stableKey = `canonical_offline_${tag}`;
  let cycle = await db.departmentOperationalCycle.findFirst({ where: { departmentId, stableKey, status: "PUBLISHED" } });
  if (!cycle) {
    const draft = await cycles.createDraft(session, { facilityId, departmentId, client: db, actor: { userId: manager.userId }, draft: { stableKey, label: `Canonical ${tag} service`, nodeKind: "PERIOD", cycleType: "SERVICE", mealType: "LUNCH", startLocal: "00:00", endLocal: "23:59", applicableDaysOfWeek: [0,1,2,3,4,5,6], effectiveFrom, locationMode: "EXPLICIT_UNITS", spaceIds: [room.id] } });
    cycle = await cycles.publishCycle(session, { facilityId, departmentId, cycleId: draft.id, actor: { userId: manager.userId }, allowImmediate: true, client: db });
  }
  let keyPoint = await db.departmentOperationalCycle.findFirst({ where: { departmentId, stableKey: `canonical_${tag}_ready`, status: "PUBLISHED" } });
  if (!keyPoint) {
    const draft = await cycles.createDraft(session, { facilityId, departmentId, client: db, actor: { userId: manager.userId }, draft: {
      stableKey: `canonical_${tag}_ready`, label: "Ready", nodeKind: "KEY_TIME", parentStableKey: stableKey,
      cycleType: "SERVICE", mealType: "LUNCH", applicableDaysOfWeek: [0,1,2,3,4,5,6], effectiveFrom, occurrenceTracking: "REQUIRED",
      locationMode: "EXPLICIT_UNITS", spaceIds: [room.id], keyTimeGroups: [{ dueLocal: "07:00", spaceIds: [room.id] }],
    } });
    keyPoint = await cycles.publishCycle(session, { facilityId, departmentId, cycleId: draft.id, actor: { userId: manager.userId }, allowImmediate: true, client: db });
  }
  let published = await db.departmentWorkPlan.findFirst({ where: { departmentId, stableKey, status: "PUBLISHED" } });
  if (!published) {
    const draft = await work.createDraft(session, { facilityId, departmentId, client: db, actor: { userId: manager.userId }, draft: { stableKey, name: `Canonical ${tag} opening checks`, applicabilities: [{ kind: "SPECIFIC_SPACE", spaceId: room.id }], items: Array.from({ length: 1 + extraWorkItems }, (_, i) => ({ itemKey: `opening_${i}`, label: i ? `Certification Work ${i}` : "Check food service supplies", instructions: "Verify supplies for this exact Space before confirming completion.", displaySequence: 10 + i, scheduleKind: "OPERATIONAL_CYCLE", cycleStableKeys: [stableKey], completionMode: "EXPLICIT_CONFIRMATION", responsibilityMode: "UNIT_SHARED" })) } });
    published = await work.publishWorkPlan(session, { facilityId, departmentId, workPlanId: draft.id, actor: { userId: manager.userId }, client: db });
  }
  for (let i = 0; i < extraKeyTimes; i++) {
    const draft = await cycles.createDraft(session, { facilityId, departmentId, client: db, actor: { userId: manager.userId }, draft: {
      stableKey: `canonical_${tag}_actual_${i}`, label: `Service check ${i + 1}`, nodeKind: "KEY_TIME", parentStableKey: stableKey,
      cycleType: "SERVICE", mealType: "LUNCH", applicableDaysOfWeek: [0,1,2,3,4,5,6], effectiveFrom, occurrenceTracking: "OPTIONAL",
      locationMode: "EXPLICIT_UNITS", spaceIds: [room.id], keyTimeGroups: [{ dueLocal: "08:00", spaceIds: [room.id] }],
    } });
    await cycles.publishCycle(session, { facilityId, departmentId, cycleId: draft.id, actor: { userId: manager.userId }, allowImmediate: true, client: db });
  }
  return { facilityId, departmentId, unitId: room.unitId, spaceId: room.id, profileId: profile.profileId, cycleId: cycle.id, keyPointId: keyPoint.id, cycleStableKey: stableKey, workPlanId: published.id, workLabel: "Check food service supplies", people };
}

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient, RoleKey } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { applyFacilitySubscription } from "@/lib/billing/apply-stripe-event";
import { ensureUserFacilityAccessGrant } from "@/lib/facility-access/assert-user-facility-access";
import { facilityLocalDateToServiceDate, getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";
import { prepareSpace, syncSpace } from "@/lib/offline/space/service";
import { commandSchema } from "@/lib/offline/space/contract";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { transitionAssignment } from "./lifecycle";
import { prisma as applicationDb } from "@/lib/prisma";

const url = process.env.VERIFY_DATABASE_URL;
if (url) assertDisposableDatabaseUrl(url);
if (url && url !== process.env.DATABASE_URL) throw new Error("Application-client regression requires matching disposable database URLs.");
const skip = !url;
process.env.DIETARY_JOB_FLOW_ENABLED = "true";
process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "true";
process.env.AUTH_SECRET ||= "local-assignment-lifecycle-test";
process.env.OFFLINE_RECOVERY_KEYS = JSON.stringify({ lifecycle: Buffer.alloc(32, 29).toString("base64") });
process.env.OFFLINE_RECOVERY_ACTIVE_KEY = "lifecycle";

async function fixture(db: PrismaClient) {
  await db.role.createMany({ data: Object.values(RoleKey).map(key => ({ key, name: key })), skipDuplicates: true });
  const tag = randomUUID().slice(0, 8);
  const organization = await db.organization.create({ data: { name: `Assignment lifecycle ${tag}` } });
  const facility = await db.facility.create({ data: { organizationId: organization.id, displayName: `Lifecycle ${tag}`, timezone: "America/New_York" } });
  await applyFacilitySubscription({ facilityId: facility.id, status: "ACTIVE", departmentKeys: ["DIETARY"] }, db);
  const department = await db.department.findFirstOrThrow({ where: { facilityId: facility.id, key: "DIETARY" } });
  const unit = await db.unit.create({ data: { facilityId: facility.id, name: "Assigned neighborhood", unitType: "OTHER", hierarchyRole: "NEIGHBORHOOD" } });
  const space = await db.unitSpace.create({ data: { facilityId: facility.id, unitId: unit.id, name: "Assignment Space", spaceType: "OTHER", responsibilities: { create: { departmentId: department.id } } } });
  async function person(role: RoleKey, label: string) {
    const platformRole = await db.role.findUniqueOrThrow({ where: { key: role } });
    const user = await db.user.create({ data: { email: `assignment-${label}-${tag}@example.invalid`, displayName: label,
      facilityId: facility.id, primaryDepartmentId: department.id, roleId: platformRole.id, emailVerifiedAt: new Date() } });
    await ensureUserFacilityAccessGrant(db, { userId: user.id, facilityId: facility.id, roleKey: role });
    const employee = await db.employee.create({ data: { userId: user.id, facilityId: facility.id, primaryDepartmentId: department.id,
      firstName: label, lastName: tag, roleType: role } });
    const session: FacilitySession = { uid: user.id, name: label, email: user.email, authKind: "user", authMethod: "PASSWORD",
      scopeKind: "facility", facilityId: facility.id, role, primaryDepartmentId: department.id, sessionVersion: user.sessionVersion,
      exp: Math.floor(Date.now() / 1000) + 43200 };
    return { user, employee, session };
  }
  const head = await person("MANAGER", "Head"), worker = await person("STAFF", "Worker"), other = await person("STAFF", "Other");
  await db.department.update({ where: { id: department.id }, data: { headEmployeeId: head.employee.id } });
  await db.employeeOperationalRoleQualification.create({ data: { facilityId: facility.id, departmentId: department.id, employeeId: worker.employee.id, roleKey: "SERVER" } });
  const serviceDateKey = toServiceDateKey(getFacilityServiceDate(facility.timezone, new Date()));
  const plan = await db.operationalAssignmentPlan.create({ data: { facilityId: facility.id, departmentId: department.id,
    serviceDate: facilityLocalDateToServiceDate(serviceDateKey), status: "CONFIRMED", confirmedByUserId: head.user.id, confirmedAt: new Date() } });
  // Unit is deliberately null: persisted explicit Space membership supplies location authority.
  const assignment = await db.operationalAssignment.create({ data: { facilityId: facility.id, departmentId: department.id,
    employeeId: worker.employee.id, planId: plan.id, serviceDate: plan.serviceDate, roleKey: "SERVER", roleLabel: "Server", status: "ACTIVE",
    notes: "Prepare this service station.\nConfirm all assigned locations before finishing.",
    locations: { create: { unitSpaceId: space.id, unitId: unit.id } } } });
  const scope = { facilityId: facility.id, departmentId: department.id, unitId: unit.id, spaceId: space.id };
  const device = { facilityId: facility.id, unitId: unit.id };
  const prepare = () => prepareSpace(db, worker.session, scope, device);
  const command = (bundle: Awaited<ReturnType<typeof prepare>>["bundle"]) => {
    const target = bundle.targets.find(row => row.kind === "ASSIGNMENT")!;
    assert(target);
    return commandSchema.parse({ id: randomUUID(), issuanceId: bundle.issuanceId, kind: "ASSIGNMENT", target: target.id,
      baseline: target.baseline, occurredAt: new Date().toISOString(), note: "All assigned locations finished." });
  };
  return { facility, department, unit, space, worker, other, head, plan, assignment, scope, device, prepare, command };
}
async function run(fn: (db: PrismaClient) => Promise<void>) {
  const db = new PrismaClient({ datasources: { db: { url: url! } } });
  try { await fn(db); } finally { await db.$disconnect(); }
}

test("Assignment: own confirmed completion appends history; only authorized reopen appends another event", { skip }, () => run(async db => {
  const f = await fixture(db);
  await assert.rejects(transitionAssignment(db, { session: f.other.session, assignmentId: f.assignment.id, action: "complete" }), /authority/);
  await transitionAssignment(db, { session: f.worker.session, assignmentId: f.assignment.id, action: "complete", expectedUpdatedAt: f.assignment.updatedAt.toISOString(), reason: "Finished station" });
  assert.equal((await db.operationalAssignment.findUniqueOrThrow({ where: { id: f.assignment.id } })).status, "COMPLETED");
  const event = await db.operationalAssignmentEvent.findFirstOrThrow({ where: { assignmentId: f.assignment.id, eventType: "COMPLETED" } });
  assert.equal(event.actorUserId, f.worker.user.id); assert.equal(event.reason, "Finished station");
  await assert.rejects(transitionAssignment(db, { session: f.worker.session, assignmentId: f.assignment.id, action: "reopen", reason: "Again" }), /authority/);
  await assert.rejects(transitionAssignment(db, { session: f.head.session, assignmentId: f.assignment.id, action: "reopen" }), /reason/);
  await transitionAssignment(db, { session: f.head.session, assignmentId: f.assignment.id, action: "reopen", reason: "Recheck the station" });
  assert.equal((await db.operationalAssignment.findUniqueOrThrow({ where: { id: f.assignment.id } })).status, "ACTIVE");
  assert.equal(await db.operationalAssignmentEvent.count({ where: { assignmentId: f.assignment.id, eventType: "REOPENED" } }), 1);
  await assert.rejects(transitionAssignment(db, { session: f.worker.session, assignmentId: f.assignment.id, action: "complete", expectedUpdatedAt: f.assignment.updatedAt.toISOString() }), /changed/);
  assert.equal(await db.operationalAssignmentEvent.count({ where: { assignmentId: f.assignment.id, eventType: "COMPLETED" } }), 1);
}));

test("Assignment: draft/closed plan, changed authority, foreign Facility and PIN device cannot complete", { skip }, () => run(async db => {
  const f = await fixture(db), complete = (session = f.worker.session) => transitionAssignment(db, { session, assignmentId: f.assignment.id,
    action: "complete", expectedUpdatedAt: f.assignment.updatedAt.toISOString() });
  await db.operationalAssignmentPlan.update({ where: { id: f.plan.id }, data: { status: "DRAFT" } });
  await assert.rejects(complete(), /confirmed/);
  await db.operationalAssignmentPlan.update({ where: { id: f.plan.id }, data: { status: "CLOSED" } });
  await assert.rejects(complete(), /closed/);
  await db.operationalAssignmentPlan.update({ where: { id: f.plan.id }, data: { status: "CONFIRMED" } });
  await assert.rejects(complete({ ...f.worker.session, facilityId: "foreign" }), /not found/);
  await assert.rejects(complete({ ...f.worker.session, authKind: "employee", authMethod: "QUICK_PIN", uid: f.worker.employee.id, activeUnitId: "foreign", sessionVersion: f.worker.employee.sessionVersion }), /Neighborhood/);
  await db.user.update({ where: { id: f.worker.user.id }, data: { sessionVersion: { increment: 1 } } });
  await assert.rejects(complete(), /Authority changed/);
  assert.equal(await db.operationalAssignmentEvent.count({ where: { assignmentId: f.assignment.id } }), 0);
}));

test("Assignment: replacement cancellation rolls back with creation and rejects another Department", { skip }, () => run(async db => {
  const f = await fixture(db);
  await assert.rejects(db.$transaction(async tx => {
    await transitionAssignment(tx, { session: f.head.session, assignmentId: f.assignment.id, action: "cancel", reason: "Replace",
      departmentId: f.department.id, serviceDateKey: toServiceDateKey(f.plan.serviceDate), deferCoverageObservation: true });
    throw new Error("synthetic replacement creation failed");
  }), /creation failed/);
  assert.equal((await db.operationalAssignment.findUniqueOrThrow({ where: { id: f.assignment.id } })).status, "ACTIVE");
  assert.equal(await db.operationalAssignmentEvent.count({ where: { assignmentId: f.assignment.id } }), 0);
  await assert.rejects(db.$transaction(tx => transitionAssignment(tx, { session: f.head.session, assignmentId: f.assignment.id,
    action: "cancel", departmentId: "other-department", deferCoverageObservation: true })), /this Department/);
}));

test("Assignment offline: Space-only scope, instructions, concurrent completion and immutable same-command receipt", { skip }, () => run(async db => {
  const f = await fixture(db), prepared = await f.prepare(), cmd = f.command(prepared.bundle);
  assert.equal(prepared.bundle.targets.find(row => row.kind === "ASSIGNMENT")?.instructions, f.assignment.notes);
  const results = await Promise.all([syncSpace(db, f.worker.session, [cmd], f.device), syncSpace(db, f.worker.session, [cmd], f.device)]);
  assert(results.every(rows => rows[0].status === "committed"), JSON.stringify(results));
  assert.equal(await db.operationalAssignmentEvent.count({ where: { assignmentId: f.assignment.id, eventType: "COMPLETED" } }), 1);
  assert.equal(await db.offlineSyncReceipt.count({ where: { facilityId: f.facility.id, clientCommandId: cmd.id } }), 1);
  assert.equal((await syncSpace(db, f.worker.session, [{ ...cmd, note: "different" }], f.device))[0].status, "blocked");
  assert.deepEqual((await syncSpace(db, f.worker.session, [cmd], f.device, true))[0], results[0][0]);
  await transitionAssignment(db, { session: f.head.session, assignmentId: f.assignment.id, action: "reopen", reason: "Recheck" });
  assert.equal((await syncSpace(db, f.worker.session, [{ ...cmd, id: randomUUID() }], f.device))[0].status, "conflict");
  assert.equal((await db.operationalAssignment.findUniqueOrThrow({ where: { id: f.assignment.id } })).status, "ACTIVE");
}));

test("Assignment offline: receipt failure rolls back completion; exact retry commits once", { skip }, () => run(async db => {
  const f = await fixture(db), p = await f.prepare(), cmd = f.command(p.bundle);
  let fail = true;
  const broken = db.$extends({ query: { offlineSyncReceipt: { async create({ args, query }) {
    if (fail && args.data.commandType === "space/1:ASSIGNMENT") { fail = false; throw new Error("synthetic receipt failure"); }
    return query(args);
  } } } }) as unknown as PrismaClient;
  assert.equal((await syncSpace(broken, f.worker.session, [cmd], f.device))[0].status, "unknown");
  assert.equal((await db.operationalAssignment.findUniqueOrThrow({ where: { id: f.assignment.id } })).status, "ACTIVE");
  assert.equal(await db.operationalAssignmentEvent.count({ where: { assignmentId: f.assignment.id, eventType: "COMPLETED" } }), 0);
  assert.equal((await syncSpace(db, f.worker.session, [cmd], f.device, true))[0].status, "unknown");
  assert.equal((await syncSpace(db, f.worker.session, [cmd], f.device))[0].status, "committed");
  assert.equal(await db.operationalAssignmentEvent.count({ where: { assignmentId: f.assignment.id, eventType: "COMPLETED" } }), 1);
}));

test("Assignment: employee cannot complete outside the current window or after Department membership removal", { skip }, () => run(async db => {
  const f = await fixture(db);
  const complete = async () => {
    const row = await db.operationalAssignment.findUniqueOrThrow({ where: { id: f.assignment.id } });
    return transitionAssignment(db, { session: f.worker.session, assignmentId: row.id, action: "complete", expectedUpdatedAt: row.updatedAt.toISOString() });
  };
  await db.operationalAssignment.update({ where: { id: f.assignment.id }, data: { startsAt: new Date(Date.now() + 3600000), endsAt: new Date(Date.now() + 7200000) } });
  await assert.rejects(complete(), /responsibility window/);
  await db.operationalAssignment.update({ where: { id: f.assignment.id }, data: { startsAt: new Date(Date.now() - 7200000), endsAt: new Date(Date.now() - 3600000) } });
  await assert.rejects(complete(), /responsibility window/);
  await db.operationalAssignment.update({ where: { id: f.assignment.id }, data: { startsAt: null, endsAt: null } });
  await db.employee.update({ where: { id: f.worker.employee.id }, data: { primaryDepartmentId: null } });
  await assert.rejects(complete(), /authority/);
  assert.equal(await db.operationalAssignmentEvent.count({ where: { assignmentId: f.assignment.id } }), 0);
}));

test("Assignment offline: a lost committed response reconciles without repeating completion", { skip }, () => run(async db => {
  const f = await fixture(db), p = await f.prepare(), cmd = f.command(p.bundle);
  let lose = true;
  const lost = new Proxy(db, { get(target, key, receiver) {
    if (key === "$transaction") return async (...args: Parameters<typeof db.$transaction>) => {
      const result = await Reflect.apply(db.$transaction, db, args);
      if (lose) { lose = false; throw new Error("synthetic response lost after COMMIT"); }
      return result;
    };
    return Reflect.get(target, key, receiver);
  } });
  assert.equal((await syncSpace(lost, f.worker.session, [cmd], f.device))[0].status, "unknown");
  assert.equal((await syncSpace(db, f.worker.session, [cmd], f.device, true))[0].status, "committed");
  assert.equal((await syncSpace(db, f.worker.session, [cmd], f.device))[0].status, "committed");
  assert.equal(await db.operationalAssignmentEvent.count({ where: { assignmentId: f.assignment.id, eventType: "COMPLETED" } }), 1);
  assert.equal(await db.offlineSyncReceipt.count({ where: { facilityId: f.facility.id, clientCommandId: cmd.id } }), 1);
}));

test("Assignment: the application Prisma proxy enters the transaction and commits event plus attention together", { skip }, () => run(async db => {
  const f = await fixture(db);
  const result = await transitionAssignment(applicationDb, { session: f.worker.session, assignmentId: f.assignment.id,
    action: "complete", expectedUpdatedAt: f.assignment.updatedAt.toISOString(), reason: "Application client transaction" });
  assert.equal(result.status, "COMPLETED");
  assert.equal(await db.operationalAssignmentEvent.count({ where: { assignmentId: f.assignment.id, eventType: "COMPLETED" } }), 1);
  assert.equal(await db.notificationOutbox.count({ where: { id: { in: result.outboxIds } } }), result.outboxIds.length);
  assert(result.outboxIds.length > 0);
}));

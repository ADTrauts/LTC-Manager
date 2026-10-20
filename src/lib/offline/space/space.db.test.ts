import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, RoleKey } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { applyFacilitySubscription } from "@/lib/billing/apply-stripe-event";
import { getFacilityServiceDate, toServiceDateKey, facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prepareSpace, recoverSpace, syncSpace, digest } from "./service";
import { credentialProof, escrowKey, openEscrow, readCredentialProof } from "./keys";
import { commandSchema, requestSchema, type SpaceCommand } from "./contract";
// Canonical physical/function/cycle/work fixture owners; confirmed assignment
// snapshots below are SQL setup only. Browser gates exercise actual board owners.
import { prepareCanonicalOfflineFixture } from "../../../../scripts/verify/canonical-offline-fixtures.mjs";
const url = process.env.VERIFY_DATABASE_URL || process.env.OFFLINE_RUNTIME_TEST_DATABASE_URL;
const skip = !url;
if (url)
    assertDisposableDatabaseUrl(url);
process.env.AUTH_SECRET ||= "space-offline-synthetic-secret";
process.env.SEED_DEMO_PASSWORD ||= "SpaceSynthetic!ChangeMe";
process.env.OFFLINE_RECOVERY_KEYS = JSON.stringify({ test: Buffer.alloc(32, 17).toString("base64") });
process.env.OFFLINE_RECOVERY_ACTIVE_KEY = "test";
process.env.DIETARY_JOB_FLOW_ENABLED = "true";
process.env.OPERATIONAL_ASSIGNMENTS_ENABLED = "true";
process.env.DEPARTMENT_OPERATIONAL_PROFILES_ENABLED = "true";
async function run(fn: (db: PrismaClient) => Promise<void>) { const db = new PrismaClient({ datasources: { db: { url: url! } } }); try {
    await fn(db);
}
finally {
    await db.$disconnect();
} }
async function fixture(db: PrismaClient) {
    await db.role.createMany({ data: Object.values(RoleKey).map(key => ({ key, name: key })), skipDuplicates: true });
    const tag = randomUUID().slice(0, 8), org = await db.organization.create({ data: { name: `Offline ${tag}` } }), facility = await db.facility.create({ data: { organizationId: org.id, displayName: `Offline ${tag}`, timezone: "America/New_York" } });
    await applyFacilitySubscription({ facilityId: facility.id, status: "ACTIVE", departmentKeys: ["DIETARY"] }, db);
    const department = await db.department.findFirstOrThrow({ where: { facilityId: facility.id, key: "DIETARY" } });
    const f = await prepareCanonicalOfflineFixture(db, { facilityId: facility.id, departmentId: department.id, tag: `sql-${tag}`, pin: "846205" });
    const date = facilityLocalDateToServiceDate(toServiceDateKey(getFacilityServiceDate(facility.timezone, new Date()))), plan = await db.operationalAssignmentPlan.create({ data: { facilityId: facility.id, departmentId: department.id, serviceDate: date, status: "CONFIRMED", confirmedAt: new Date(), confirmedByUserId: f.people.manager.userId } });
    for (const p of [f.people.worker, f.people.secondWorker])
        await db.operationalAssignment.create({ data: { facilityId: facility.id, departmentId: department.id, employeeId: p.employeeId, unitId: f.unitId, serviceDate: date, planId: plan.id, roleKey: "SERVER", roleLabel: "Server", status: "ACTIVE" } });
    const session = { uid: f.people.worker.userId, authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", role: "STAFF", facilityId: facility.id, primaryDepartmentId: department.id, name: "Canonical worker", email: f.people.worker.email, sessionVersion: 0, exp: Math.floor(Date.now() / 1000) + 43200 } as FacilitySession;
    const scope = { facilityId: facility.id, departmentId: department.id, unitId: f.unitId, spaceId: f.spaceId }, device = { facilityId: facility.id, unitId: f.unitId };
    const prepare = (s = session) => prepareSpace(db, s, scope, device);
    const command = (bundle: Awaited<ReturnType<typeof prepare>>["bundle"], kind: SpaceCommand["kind"] = "WORK") => { const target = bundle.targets.find(t => t.kind === kind && t.available && !t.completed)!; assert.ok(target, `Missing ${kind}`); return commandSchema.parse({ id: randomUUID(), issuanceId: bundle.issuanceId, kind, target: target.id, baseline: target.baseline, occurredAt: new Date().toISOString(), note: "" }); };
    return { ...f, session, scope, device, prepare, command, plan };
}
test("space SQL: canonical OTHER Space prepares exact targets and no domain completion", { skip }, () => run(async (db) => {
    const f = await fixture(db), p = await f.prepare();
    assert.equal(p.bundle.scope.spaceId, f.spaceId);
    assert.equal(p.bundle.targets.find(t => t.kind === "WORK")!.instructions, "Verify supplies for this exact Space before confirming completion.");
    assert.equal(p.bundle.targets.filter(t => t.kind === "KEY_TIME_ACTUAL").length, 1);
    assert.equal(await db.departmentWorkOccurrence.count({ where: { facilityId: f.facilityId } }), 0);
    assert.equal(await db.operationalCycleKeyPointActual.count({ where: { facilityId: f.facilityId } }), 0);
    const issued = await db.offlineBundleIssuance.findUniqueOrThrow({ where: { id: p.bundle.issuanceId } });
    assert.ok(issued.recoveryKeyEnvelope);
    assert.ok(!JSON.stringify(issued.recoveryKeyEnvelope).includes(p.key));
    assert.equal(openEscrow(issued.recoveryKeyEnvelope, digest({ id: issued.id, scope: issued.spaceScope, sessionVersion: issued.sessionVersion, user: issued.actorUserId, employee: issued.actorEmployeeId })).toString("base64"), p.key);
}));
test("space SQL: concurrent/repeated Work commits one canonical effect/event and immutable receipt; changed intent rejects", { skip }, () => run(async (db) => {
    const f = await fixture(db), p = await f.prepare(), cmd = f.command(p.bundle);
    const outcomes = await Promise.all([syncSpace(db, f.session, [cmd], f.device), syncSpace(db, f.session, [cmd], f.device)]);
    assert.ok(outcomes.every(r => r[0]!.status === "committed"), JSON.stringify(outcomes));
    assert.equal(await db.departmentWorkOccurrence.count({ where: { facilityId: f.facilityId } }), 1);
    assert.equal(await db.departmentWorkEvent.count({ where: { facilityId: f.facilityId, eventType: "COMPLETED" } }), 1);
    assert.equal(await db.offlineSyncReceipt.count({ where: { facilityId: f.facilityId } }), 1);
    const changed = await syncSpace(db, f.session, [{ ...cmd, note: "different intent" }], f.device);
    assert.equal(changed[0]!.status, "blocked");
    const recon = await syncSpace(db, f.session, [cmd], f.device, true);
    assert.deepEqual(recon[0], outcomes[0]![0]);
}));
test("space SQL: Key Time actual is once; another command conflicts, never corrects", { skip }, () => run(async (db) => {
    const f = await fixture(db), p = await f.prepare(), cmd = f.command(p.bundle, "KEY_TIME_ACTUAL");
    const [a, b] = await Promise.all([syncSpace(db, f.session, [cmd], f.device), syncSpace(db, f.session, [{ ...cmd, id: randomUUID() }], f.device)]);
    assert.deepEqual([a[0]!.status, b[0]!.status].sort(), ["committed", "conflict"]);
    assert.equal(await db.operationalCycleKeyPointActual.count({ where: { facilityId: f.facilityId } }), 1);
    assert.equal(await db.offlineConflict.count({ where: { facilityId: f.facilityId } }), 1);
}));
test("space SQL: injected receipt failure rolls back effect; same-ID unknown reconciliation and partial retry commit once", { skip }, () => run(async (db) => {
    const f = await fixture(db), p = await f.prepare(), work = f.command(p.bundle), actual = f.command(p.bundle, "KEY_TIME_ACTUAL");
    let fail = true;
    const broken = db.$extends({ query: { offlineSyncReceipt: { async create({ args, query }) { if (fail && args.data.commandType === "space/1:WORK") {
                    fail = false;
                    throw Error("injected receipt loss");
                } return query(args); } } } }) as unknown as PrismaClient;
    const partial = await syncSpace(broken, f.session, [work, actual], f.device);
    assert.deepEqual(partial.map(r => r.status), ["unknown", "committed"]);
    assert.equal(await db.departmentWorkOccurrence.count({ where: { facilityId: f.facilityId } }), 0);
    assert.equal((await syncSpace(db, f.session, [work], f.device, true))[0]!.status, "unknown");
    assert.equal((await syncSpace(db, f.session, [work], f.device))[0]!.status, "committed");
    assert.equal(await db.departmentWorkOccurrence.count({ where: { facilityId: f.facilityId } }), 1);
}));
test("space SQL: publication drift conflicts; billing suspension, wrong scope and Console denied", { skip }, () => run(async (db) => {
    const f = await fixture(db), p = await f.prepare(), cmd = f.command(p.bundle);
    await db.facility.update({ where: { id: f.facilityId }, data: { timezone: "America/Los_Angeles" } });
    assert.equal((await syncSpace(db, f.session, [f.command(p.bundle, "KEY_TIME_ACTUAL")], f.device))[0]!.status,"conflict");
    assert.equal(await db.operationalCycleKeyPointActual.count({ where: { facilityId: f.facilityId } }),0);
    await db.facility.update({ where: { id: f.facilityId }, data: { timezone: "America/New_York" } });
    await db.departmentWorkPlan.update({ where: { id: f.workPlanId }, data: { status: "RETIRED" } });
    assert.equal((await syncSpace(db, f.session, [cmd], f.device))[0]!.status, "conflict");
    await assert.rejects(() => prepareSpace(db, { ...f.session, facilityId: "other" }, f.scope, f.device), /context changed/);
    await assert.rejects(() => f.prepare({ ...f.session, authKind: "harbor_staff" }), /employee execution/);
    await assert.rejects(() => f.prepare({ ...f.session, role: "FACILITY_ADMINISTRATOR" }), /employee execution/);
    await db.facilityBilling.update({ where: { facilityId: f.facilityId }, data: { status: "UNPAID" } });
    await assert.rejects(() => f.prepare(), /licensed/);
}));
test("space SQL: fresh credential proof and explicit exact review required; one-use recovery preserves original lease", { skip }, () => run(async (db) => {
    const f = await fixture(db), p = await f.prepare();
    await assert.rejects(() => recoverSpace(db, f.session, p.bundle.issuanceId, p.bundle.reviewDigest, f.device, ""), /Authenticate again/);
    await new Promise(r => setTimeout(r, 5));
    const proof = credentialProof(`user:${f.session.uid}`, 0);
    const recovered = await recoverSpace(db, f.session, p.bundle.issuanceId, p.bundle.reviewDigest, f.device, proof);
    assert.equal(recovered.key, p.key);
    assert.equal(recovered.bundle.expiresAt, p.bundle.expiresAt);
    await assert.rejects(() => recoverSpace(db, f.session, p.bundle.issuanceId, p.bundle.reviewDigest, f.device, proof), /Authenticate again/);
    const second = { ...f.session, uid: f.people.secondWorker.userId, email: f.people.secondWorker.email };
    await assert.rejects(() => recoverSpace(db, second, p.bundle.issuanceId, p.bundle.reviewDigest, f.device, credentialProof(`user:${second.uid}`, 0)), /unavailable/);
}));
test("space SQL: authority expires during lock wait; no effect/receipt commits", { skip }, () => run(async (db) => {
    const f = await fixture(db), p = await f.prepare(), cmd = f.command(p.bundle);
    await db.userFacilityRolePeriod.updateMany({ where: { userFacilityAccess: { userId: f.session.uid, facilityId: f.facilityId } }, data: { endsAt: new Date(Date.now() + 500) } });
    let unlock!: () => void, signal!: () => void;
    const ready = new Promise<void>(r => signal = r), hold = new Promise<void>(r => unlock = r);
    const holder = db.$transaction(async (tx) => { await tx.$queryRaw `SELECT "id" FROM "Facility" WHERE "id"=${f.facilityId} FOR UPDATE`; signal(); await hold; }, { timeout: 10000 });
    await ready;
    const request = syncSpace(db, f.session, [cmd], f.device);
    await new Promise(r => setTimeout(r, 800));
    unlock();
    await holder;
    const r = await request;
    assert.equal(r[0]!.status, "blocked");
    assert.equal(await db.departmentWorkOccurrence.count({ where: { facilityId: f.facilityId } }), 0);
    assert.equal(await db.offlineSyncReceipt.count({ where: { facilityId: f.facilityId } }), 0);
}));
test("space contract: no offline correction/adjustment; exact scope and bounded commands", () => {
    assert.equal(requestSchema.safeParse({ protocol: "space/1", action: "sync", commands: [{ kind: "KEY_TIME_CORRECTION" }] }).success, false);
    const key = Buffer.alloc(32, 3), wrapped = escrowKey(key, "actor/scope");
    assert.deepEqual(openEscrow(wrapped, "actor/scope"), key);
    assert.throws(() => openEscrow(wrapped, "other actor"));
    const proof = credentialProof("user:a", 1, 1000);
    assert.equal(readCredentialProof(proof, "user:a", 1, 999, 1001), true);
    assert.equal(readCredentialProof(proof, "user:b", 1, 999, 1001), false);
    assert.equal(readCredentialProof(proof, "user:a", 1, 999, 302000), false);
});
test("space SQL: short lease expires; fresh same-actor review can replay original intent without renewal", { skip }, () => run(async (db) => {
    const f = await fixture(db), short = { ...f.session, exp: Math.ceil(Date.now() / 1000) + 1 }, p = await f.prepare(short), cmd = f.command(p.bundle);
    await new Promise(r => setTimeout(r, Math.max(0, Date.parse(p.bundle.expiresAt) - Date.now() + 10)));
    assert.equal((await syncSpace(db, f.session, [cmd], f.device))[0]!.status, "blocked");
    const proof = credentialProof(`user:${f.session.uid}`, 0);
    const recovered = await recoverSpace(db, f.session, p.bundle.issuanceId, p.bundle.reviewDigest, f.device, proof);
    assert.equal(recovered.reviewOnly, true);
    assert.equal(recovered.bundle.expiresAt, p.bundle.expiresAt);
    assert.equal((await syncSpace(db, f.session, [cmd], f.device, false, true, proof))[0]!.status, "committed");
    assert.equal((await db.offlineBundleIssuance.findUniqueOrThrow({ where: { id: p.bundle.issuanceId } })).offlineAuthorizedUntil.toISOString(), p.bundle.expiresAt);
}));
test("space SQL: changed assignment and credential version cannot replay reviewed old authority", { skip }, () => run(async (db) => {
    const f = await fixture(db), p = await f.prepare(), cmd = f.command(p.bundle);
    await db.operationalAssignment.updateMany({ where: { employeeId: f.people.worker.employeeId }, data: { roleLabel: "Reassigned responsibility" } });
    assert.equal((await syncSpace(db, f.session, [cmd], f.device))[0]!.status, "conflict");
    await db.user.update({ where: { id: f.session.uid }, data: { sessionVersion: { increment: 1 } } });
    assert.equal((await syncSpace(db, f.session, [f.command(p.bundle, "KEY_TIME_ACTUAL")], f.device))[0]!.status, "blocked");
    assert.equal(await db.operationalCycleKeyPointActual.count({ where: { facilityId: f.facilityId } }), 0);
}));
test("space SQL: a lost committed response reconciles the authoritative same-ID receipt", { skip }, () => run(async (db) => {
    const f = await fixture(db), p = await f.prepare(), cmd = f.command(p.bundle);
    let lose = true;
    const lost = new Proxy(db, { get(target, key, receiver) { if (key === "$transaction")
            return async (...args: Parameters<typeof db.$transaction>) => { const out = await Reflect.apply(db.$transaction, db, args); if (lose) {
                lose = false;
                throw Error("synthetic response lost after COMMIT");
            } return out; }; return Reflect.get(target, key, receiver); } });
    assert.equal((await syncSpace(lost, f.session, [cmd], f.device))[0]!.status, "unknown");
    assert.equal((await syncSpace(db, f.session, [cmd], f.device, true))[0]!.status, "committed");
    assert.equal((await syncSpace(db, f.session, [cmd], f.device))[0]!.status, "committed");
    assert.equal(await db.departmentWorkEvent.count({ where: { facilityId: f.facilityId, eventType: "COMPLETED" } }), 1);
    assert.equal(await db.offlineSyncReceipt.count({ where: { facilityId: f.facilityId } }), 1);
}));
test("space SQL: NONE has no actual target; OPTIONAL and REQUIRED preserve semantics; evidence stays online", { skip }, () => run(async (db) => {
    const f = await fixture(db);
    await db.departmentOperationalCycle.update({ where: { id: f.keyPointId }, data: { occurrenceTracking: "NONE" } });
    assert.equal((await f.prepare()).bundle.targets.filter(t => t.kind === "KEY_TIME_ACTUAL").length, 0);
    await db.departmentOperationalCycle.update({ where: { id: f.keyPointId }, data: { occurrenceTracking: "OPTIONAL" } });
    const optional = await f.prepare();
    assert.equal(optional.bundle.targets.filter(t => t.kind === "KEY_TIME_ACTUAL").length, 1);
    assert.equal((await syncSpace(db, f.session, [f.command(optional.bundle, "KEY_TIME_ACTUAL")], f.device))[0]!.status, "committed");
    await db.departmentWorkItem.updateMany({ where: { workPlanId: f.workPlanId }, data: { completionMode: "LINKED_EVIDENCE" } });
    const evidence = await f.prepare(), target = evidence.bundle.targets.find(t => t.kind === "WORK")!;
    assert.equal(target.available, false);
    assert.match(target.unavailableReason!, /evidence/);
    const command = commandSchema.parse({ id: randomUUID(), issuanceId: evidence.bundle.issuanceId, kind: "WORK", target: target.id, baseline: target.baseline, occurredAt: new Date().toISOString() });
    assert.equal((await syncSpace(db, f.session, [command], f.device))[0]!.status, "blocked");
    assert.equal(await db.departmentWorkOccurrence.count({ where: { facilityId: f.facilityId } }), 0);
}));
test("space SQL: online and replay share canonical completion locks", { skip }, () => run(async (db) => {
    const f = await fixture(db), p = await f.prepare(), cmd = f.command(p.bundle, "KEY_TIME_ACTUAL");
    const { completeKeyTimeDayExpectation } = await import("@/lib/operational-cycles/key-time-day-actions");
    const outcomes = await Promise.all([syncSpace(db, f.session, [cmd], f.device), completeKeyTimeDayExpectation({ session: f.session, expectationId: cmd.target }, db)]);
    if (outcomes[0][0]!.status === "unknown")
        await syncSpace(db, f.session, [cmd], f.device);
    assert.equal(await db.operationalCycleKeyPointActual.count({ where: { facilityId: f.facilityId } }), 1);
    const work = f.command(p.bundle), { resolveUnitWorkRequirements } = await import("@/lib/department-work/load-runtime-work"), { completeExplicit } = await import("@/lib/department-work/occurrence-service");
    const requirements = await resolveUnitWorkRequirements({ client: db, facilityId: f.facilityId, departmentId: f.departmentId, unitId: f.unitId, operationalDate: facilityLocalDateToServiceDate(p.bundle.operationalDate), operationalDateKey: p.bundle.operationalDate, now: new Date(), facilityTimezone: "America/New_York" });
    const [replay] = await Promise.all([syncSpace(db, f.session, [work], f.device), completeExplicit(f.session, { facilityId: f.facilityId, departmentId: f.departmentId, requirement: requirements.find(r => r.occurrenceKey === work.target)!, operationalDate: p.bundle.operationalDate, actor: { userId: f.session.uid, employeeId: f.people.worker.employeeId }, client: db })]);
    if (replay[0]!.status === "unknown")
        assert.ok(["reused", "committed"].includes((await syncSpace(db, f.session, [work], f.device))[0]!.status));
    assert.equal(await db.departmentWorkOccurrence.count({ where: { facilityId: f.facilityId } }), 1);
    assert.equal(await db.departmentWorkEvent.count({ where: { facilityId: f.facilityId, eventType: "COMPLETED" } }), 1);
}));
test("space SQL: supervisor not-required direction conflicts instead of implicit completion",{skip},()=>run(async db=>{
 const f=await fixture(db),p=await f.prepare(),cmd=f.command(p.bundle);
 const {resolveUnitWorkRequirements}=await import("@/lib/department-work/load-runtime-work"),{markNotRequired}=await import("@/lib/department-work/occurrence-service");
 const requirements=await resolveUnitWorkRequirements({client:db,facilityId:f.facilityId,departmentId:f.departmentId,unitId:f.unitId,operationalDate:facilityLocalDateToServiceDate(p.bundle.operationalDate),operationalDateKey:p.bundle.operationalDate,now:new Date(),facilityTimezone:"America/New_York"});
 const manager={...f.session,uid:f.people.manager.userId,email:f.people.manager.email,role:"GM" as const};
 await db.$transaction(tx=>markNotRequired(manager,{facilityId:f.facilityId,departmentId:f.departmentId,requirement:requirements.find(r=>r.occurrenceKey===cmd.target)!,operationalDate:p.bundle.operationalDate,actor:{userId:manager.uid},reason:"Manager deferred this check",client:tx}));
 assert.equal((await syncSpace(db,f.session,[cmd],f.device))[0]!.status,"conflict");assert.equal((await db.departmentWorkOccurrence.findFirstOrThrow({where:{facilityId:f.facilityId}})).status,"NOT_REQUIRED");assert.equal(await db.departmentWorkEvent.count({where:{facilityId:f.facilityId,eventType:"COMPLETED"}}),0);
 assert.equal((await f.prepare()).bundle.targets.find(t=>t.id===cmd.target)!.available,false);
}));
test("space SQL: PIN scope rebind requires fresh authentication and preserves Employee attribution",{skip},()=>run(async db=>{
 const f=await fixture(db),pin={...f.session,uid:f.people.worker.employeeId,authKind:"employee" as const,authMethod:"QUICK_PIN" as const,activeUnitId:f.unitId},p=await f.prepare(pin),cmd=f.command(p.bundle);
 await assert.rejects(()=>f.prepare({...pin,activeUnitId:"other-neighborhood"}),/PIN device binding changed/);
 assert.equal((await syncSpace(db,{...pin,activeUnitId:"other-neighborhood"},[cmd],f.device))[0]!.status,"blocked");assert.equal(await db.offlineSyncReceipt.count({where:{facilityId:f.facilityId}}),0);
 assert.equal((await syncSpace(db,pin,[cmd],f.device))[0]!.status,"committed");const receipt=await db.offlineSyncReceipt.findFirstOrThrow({where:{facilityId:f.facilityId}});assert.equal(receipt.actorUserId,null);assert.equal(receipt.actorEmployeeId,f.people.worker.employeeId);
}));
test("space SQL: exhausted confirmed rollbacks report failed attempt; same identity reconciles before safe retry",{skip},()=>run(async db=>{
 const f=await fixture(db),p=await f.prepare(),cmd=f.command(p.bundle);let attempts=0;
 const unavailable=new Proxy(db,{get(target,key,receiver){if(key==="$transaction")return async()=>{attempts++;const error=Object.assign(Error("synthetic confirmed rollback"),{name:"PrismaClientKnownRequestError",code:"P2034"});throw error;};return Reflect.get(target,key,receiver);}});
 const failed=await syncSpace(unavailable,f.session,[cmd],f.device);assert.equal(attempts,5);assert.equal(failed[0]!.status,"failed");assert.match(failed[0]!.message,/This attempt rolled back/);assert.equal(await db.departmentWorkOccurrence.count({where:{facilityId:f.facilityId}}),0);
 assert.equal((await syncSpace(db,f.session,[cmd],f.device,true))[0]!.status,"unknown");assert.equal((await syncSpace(db,f.session,[cmd],f.device))[0]!.status,"committed");assert.equal(await db.offlineSyncReceipt.count({where:{facilityId:f.facilityId}}),1);
}));
test("space SQL: timing adjustment committed during lock wait invalidates the reviewed actual",{skip},()=>run(async db=>{
 const f=await fixture(db),p=await f.prepare(),cmd=f.command(p.bundle,"KEY_TIME_ACTUAL"),{recordOperationalTimingAdjustment}=await import("@/lib/operational-cycles/record-timing-adjustment");
 const original=await db.departmentOperationalCycle.findUniqueOrThrow({where:{id:f.keyPointId}});
 let observedWait=false;let release!:()=>void,signal!:()=>void;const ready=new Promise<void>(r=>signal=r),hold=new Promise<void>(r=>release=r);
 const writer=db.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "DepartmentOperationalCycle" WHERE "id"=${f.keyPointId} FOR UPDATE`;const adjusted=await recordOperationalTimingAdjustment({session:{...f.session,uid:f.people.manager.userId,role:"GM"},cycleId:f.keyPointId,serviceDate:facilityLocalDateToServiceDate(p.bundle.operationalDate),adjustedDueLocal:"09:15",reason:"Customer adjustment while tablet reconnects"},tx);assert.equal(adjusted.ok,true);signal();await hold;},{timeout:10000});await ready;
 const pending=syncSpace(db,f.session,[cmd],f.device);
 try { for(let i=0;i<50;i++){const waiting=await db.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`;if(waiting[0]!.n>0n){observedWait=true;break;}await new Promise(r=>setTimeout(r,20));} }finally{release();}
 await writer;assert.equal(observedWait,true,"PostgreSQL lock wait must be observed");const result=await pending;assert.equal(result[0]!.status,"conflict",JSON.stringify(result));assert.equal(await db.operationalCycleKeyPointActual.count({where:{facilityId:f.facilityId}}),0);
 const cycle=await db.departmentOperationalCycle.findUniqueOrThrow({where:{id:f.keyPointId}});assert.equal(cycle.timingAdjustmentRevision,1);assert.equal(cycle.updatedAt.toISOString(),original.updatedAt.toISOString());assert.equal(cycle.status,"PUBLISHED");assert.equal(cycle.version,1);assert.equal(await db.operationalCycleTimingAdjustment.count({where:{cycleId:f.keyPointId}}),1);
}));

import { createHash, randomBytes } from "node:crypto";
import { Prisma, type PrismaClient, type OfflineBundleIssuance } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { validateSessionAuthority } from "@/lib/session-revocation";
import { isCustomerDepartmentAccessAllowed } from "@/lib/department-products/load-facility-catalog";
import { isDepartmentJobFlowEnabled } from "@/lib/department-operations";
import { resolveSpaceWorkspaceViewer } from "@/lib/unit-workspace/space";
import { loadFrontlineEmployeeAssignments } from "@/lib/employee-runtime-flow/load-assignments";
import { resolveUnitWorkRequirements } from "@/lib/department-work/load-runtime-work";
import { completeExplicit } from "@/lib/department-work/occurrence-service";
import { materializeKeyTimeDayExpectations } from "@/lib/operational-cycles/materialize-key-time-day-expectations";
import { completeKeyTimeDayExpectation } from "@/lib/operational-cycles/key-time-day-actions";
import { loadPublishedCyclesWithKeyTimesForDate } from "@/lib/operational-cycles/load-published-cycles";
import { facilityLocalDateToServiceDate, getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";
import { confirmedRollback, importTransaction } from "@/lib/setup-imports/transaction";
import { actorRefForSession } from "@/lib/offline/resolve-milestone-actor";
import { LIMITS, PROTOCOL, type SpaceScope, type SpaceBundle, type SpaceCommand, type Outcome, type Target } from "./contract";
import { escrowKey, openEscrow, readCredentialProof } from "./keys";
type Tx = Prisma.TransactionClient;
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
function normalize(v: unknown): unknown { if (v instanceof Date)
    return v.toISOString(); if (Array.isArray(v))
    return v.map(normalize); if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, normalize(x)])); return v; }
export const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(normalize(v))).digest("hex");
export class SpaceOfflineError extends Error {
}
function fail(m: string): never { throw new SpaceOfflineError(m); }
export type Device = {
    facilityId: string | null;
    unitId: string | null;
};
export async function authorize(tx: Tx, s: FacilitySession, scope: SpaceScope, device: Device, now: Date, dateKey?: string) {
    if (s.facilityId !== scope.facilityId || device.facilityId !== s.facilityId || device.unitId !== scope.unitId)
        fail("Facility/device context changed. Reconnect in the assigned Space.");
    if (!["user", "employee"].includes(s.authKind) || resolveSpaceWorkspaceViewer(s).kind !== "employee" || s.accessKind)
        fail("Current employee execution authority is required.");
    if (s.authKind === "employee" && s.activeUnitId !== scope.unitId) fail("PIN device binding changed. Authenticate again in the current Neighborhood.");
    // Facility lock is also held by billing/install owners. Order stays consistent.
    await tx.$queryRaw `SELECT "id" FROM "Facility" WHERE "id"=${scope.facilityId} FOR UPDATE`;
    if (s.authKind === "user") {
        await tx.$queryRaw `SELECT "id" FROM "User" WHERE "id"=${s.uid} FOR SHARE`;
        await tx.$queryRaw `SELECT "id" FROM "UserFacilityAccess" WHERE "userId"=${s.uid} AND "facilityId"=${s.facilityId} FOR SHARE`;
        await tx.$queryRaw `SELECT p."id" FROM "UserFacilityRolePeriod" p JOIN "UserFacilityAccess" a ON a."id"=p."userFacilityAccessId" WHERE a."userId"=${s.uid} AND a."facilityId"=${s.facilityId} FOR SHARE OF p`;
    }
    await tx.$queryRaw `SELECT "id" FROM "Employee" WHERE "facilityId"=${s.facilityId} AND ("id"=${s.uid} OR "userId"=${s.uid}) FOR SHARE`;
    const auth = await validateSessionAuthority(s, tx);
    if (!auth.valid)
        fail("Authority or credentials changed. Authenticate online.");
    const employee = await tx.employee.findFirst({ where: { facilityId: s.facilityId, ...(s.authKind === "employee" ? { id: s.uid } : { userId: s.uid }), status: "ACTIVE" }, include: { employeeDepartments: true } });
    if (!employee || employee.terminationDate || !(employee.primaryDepartmentId === scope.departmentId || employee.employeeDepartments.some(d => d.departmentId === scope.departmentId)))
        fail("Active Department membership is required.");
    await tx.$queryRaw `SELECT "id" FROM "Department" WHERE "id"=${scope.departmentId} AND "facilityId"=${s.facilityId} FOR SHARE`;
    await tx.$queryRaw `SELECT "id" FROM "UnitSpace" WHERE "id"=${scope.spaceId} FOR SHARE`;
    await tx.$queryRaw `SELECT "id" FROM "Unit" WHERE "id"=${scope.unitId} FOR SHARE`;
    const [department, space, facility] = await Promise.all([
        tx.department.findFirst({ where: { id: scope.departmentId, facilityId: s.facilityId, isActive: true } }),
        tx.unitSpace.findFirst({ where: { id: scope.spaceId, facilityId: s.facilityId, unitId: scope.unitId, isActive: true, unit: { isActive: true, hierarchyRole: "NEIGHBORHOOD" } } }),
        tx.facility.findUniqueOrThrow({ where: { id: s.facilityId } }),
    ]);
    if (!department || !space || !isDepartmentJobFlowEnabled(department.key) || !await isCustomerDepartmentAccessAllowed(tx, s, scope.departmentId))
        fail("Installed, licensed Department access and an active assigned Space are required.");
    // Lock waits can outlive authority windows. Recompute the clock after waits.
    now = new Date();
    const currentDate = toServiceDateKey(getFacilityServiceDate(facility.timezone, now));
    const operationalDate = dateKey || currentDate;
    const assignmentDate = facilityLocalDateToServiceDate(currentDate);
    await tx.$queryRaw `SELECT "id" FROM "OperationalAssignmentPlan" WHERE "facilityId"=${s.facilityId} AND "departmentId"=${scope.departmentId} AND "serviceDate"=${assignmentDate} FOR SHARE`;
    await tx.$queryRaw `SELECT "id" FROM "OperationalAssignment" WHERE "employeeId"=${employee.id} AND "serviceDate"=${assignmentDate} FOR SHARE`;
    const loaded = await loadFrontlineEmployeeAssignments({ client: tx, employeeId: employee.id, facilityId: s.facilityId, departmentId: scope.departmentId, serviceDate: assignmentDate, now });
    const assignment = loaded.current;
    if (!assignment)
        fail("A current confirmed assignment is required.");
    const assigned = assignment.unitId === scope.unitId && ((assignment.scopeKind || "UNIT") === "UNIT" || loaded.locationsByAssignmentId.get(assignment.id)?.some(l => l.unitSpaceId === scope.spaceId));
    if (!assigned)
        fail("This Space is not in your confirmed assignment.");
    await tx.$queryRaw `SELECT "id" FROM "DepartmentOperationalProfile" WHERE "departmentId"=${scope.departmentId} FOR SHARE`;
    const binding = await tx.departmentRoomArchetypeBinding.findFirst({ where: { unitSpaceId: scope.spaceId, profile: { facilityId: s.facilityId, departmentId: scope.departmentId, status: "ACTIVE" }, archetype: { isActive: true } }, include: { profile: true, archetype: true } });
    if (!binding)
        fail("Publish an applicable Location Function before offline preparation.");
    // Published configuration remains locked through domain write and receipt.
    await tx.$queryRaw `SELECT "id" FROM "DepartmentWorkPlan" WHERE "departmentId"=${scope.departmentId} FOR SHARE`;
    await tx.$queryRaw `SELECT "id" FROM "DepartmentOperationalCycle" WHERE "departmentId"=${scope.departmentId} FOR SHARE`;
    await tx.$queryRaw`SELECT "id" FROM "DepartmentWorkOccurrence" WHERE "facilityId"=${s.facilityId} AND "departmentId"=${scope.departmentId} AND "spaceId"=${scope.spaceId} AND "operationalDate"=${facilityLocalDateToServiceDate(operationalDate)} FOR UPDATE`;
    const periods = s.authKind === "user" ? await tx.userFacilityRolePeriod.findMany({ where: { userFacilityAccess: { userId: s.uid, facilityId: s.facilityId }, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } }) : [];
    const authorityEnd = periods.some(p => !p.endsAt) ? Infinity : Math.max(...periods.map(p => +p.endsAt!), 0) || Infinity;
    if (!(await validateSessionAuthority(s, tx)).valid)
        fail("Authority changed during preparation or replay.");
    if (s.authKind === "user" && !periods.length)
        fail("Current Facility authority expired.");
    const until = Math.min(+now + LIMITS.leaseMs, s.exp ? s.exp * 1000 : Infinity, assignment.endsAt ? +new Date(assignment.endsAt) : Infinity, authorityEnd);
    if (until <= +now)
        fail("Current authority expired.");
    return { employee, assignment, assignmentDigest: digest({ assignment, timezone: facility.timezone, bindingId: binding.id, profileId: binding.profileId, archetypeId: binding.archetypeId }), operationalDate, facility, space, until };
}
async function catalog(tx: Tx, s: FacilitySession, scope: SpaceScope, device: Device, now: Date, dateKey?: string) {
    const context = await authorize(tx, s, scope, device, now, dateKey);
    const work = await resolveUnitWorkRequirements({ client: tx, facilityId: s.facilityId, departmentId: scope.departmentId, unitId: scope.unitId, operationalDate: facilityLocalDateToServiceDate(context.operationalDate), operationalDateKey: context.operationalDate, now, facilityTimezone: context.facility.timezone });
    const cycles = await loadPublishedCyclesWithKeyTimesForDate(s.facilityId, scope.departmentId, context.operationalDate, tx);
    await materializeKeyTimeDayExpectations({ facilityId: s.facilityId, departmentId: scope.departmentId, operationalDateKey: context.operationalDate, now, createIfMissing: true }, tx);
    const keys = await tx.operationalCycleKeyTimeDayExpectation.findMany({ where: { facilityId: s.facilityId, departmentId: scope.departmentId, spaceId: scope.spaceId, serviceDate: facilityLocalDateToServiceDate(context.operationalDate) }, orderBy: { id: "asc" } });
    for (const k of keys)
        await tx.$queryRaw `SELECT "id" FROM "OperationalCycleKeyTimeDayExpectation" WHERE "id"=${k.id} FOR UPDATE`;
    const targets: Target[] = [];
    const requirements = new Map<string, typeof work[number]>();
    for (const w of work.filter(w => w.spaceId === scope.spaceId)) {
        requirements.set(w.occurrenceKey, w);
        const intent = Object.fromEntries(Object.entries(w).filter(([key]) => !["state", "occurrenceId", "occurrenceStatus", "completedByLabel", "completedAt"].includes(key)));
        const directive = ["NOT_REQUIRED", "CANCELLED", "REOPENED"].includes(w.occurrenceStatus || "") ? w.occurrenceStatus : null;
        const evidence = w.completionMode !== "EXPLICIT_CONFIRMATION";
        const unavailable = evidence || ["NOT_REQUIRED", "NOT_APPLICABLE", "NOT_CONFIGURED"].includes(w.state) || Boolean(w.assignedEmployeeId && w.assignedEmployeeId !== context.employee.id);
        targets.push({ kind: "WORK", id: w.occurrenceKey, label: w.label, instructions: w.instructions, baseline: digest({ intent, directive, assignment: context.assignmentDigest }), completed: ["COMPLETED", "COMPLETED_WITH_EVIDENCE"].includes(w.state), available: !unavailable, unavailableReason: evidence ? "Canonical evidence is required; complete online." : unavailable ? "Work responsibility or supervisor direction requires online review." : undefined });
    }
    const keyRows = new Map<string, typeof keys[number]>();
    for (const k of keys) {
        const cycle = cycles.find(c => c.id === k.cycleId);
        const tracking = cycle ? await tx.departmentOperationalCycle.findUnique({ where: { id: cycle.id }, select: { occurrenceTracking: true } }) : null;
        if (!cycle || !tracking || tracking.occurrenceTracking === "NONE")
            continue;
        const [actuals, adjustments] = await Promise.all([tx.operationalCycleKeyPointActual.findMany({ where: { cycleId: k.cycleId, spaceId: k.spaceId, serviceDate: k.serviceDate }, orderBy: { recordedAt: "asc" } }), tx.operationalCycleTimingAdjustment.findMany({ where: { cycleId: k.cycleId, serviceDate: k.serviceDate }, orderBy: { recordedAt: "desc" }, take: 1 })]);
        keyRows.set(k.id, k);
        targets.push({ kind: "KEY_TIME_ACTUAL", id: k.id, label: `${k.displayPath} — ${adjustments[0]?.adjustedDueLocal || k.adjustedDueLocal || k.configuredDueLocal}`, baseline: digest({ cycleId: k.cycleId, version: k.cycleVersion, spaceId: k.spaceId, configured: k.configuredDueLocal, adjusted: k.adjustedDueLocal, timingAdjustmentId: adjustments[0]?.id || null, tracking: tracking.occurrenceTracking, assignment: context.assignmentDigest }), completed: actuals.length > 0, available: true });
    }
    if (targets.filter(t => t.kind === "WORK").length > LIMITS.targets || targets.filter(t => t.kind === "KEY_TIME_ACTUAL").length > LIMITS.targets)
        fail("Offline target limit exceeded. Narrow the published scope.");
    return { ...context, targets, requirements, keyRows };
}
function owned(row: OfflineBundleIssuance, s: FacilitySession) {
    const actor = row.actorUserId ? `user:${row.actorUserId}` : `employee:${row.actorEmployeeId}`;
    if (row.facilityId !== s.facilityId || actor !== actorRefForSession(s) || !row.spaceScope || !row.spaceManifest)
        fail("Offline issuance is unavailable in this actor/Facility context.");
}
function aad(row: Pick<OfflineBundleIssuance, "id" | "spaceScope" | "sessionVersion" | "actorUserId" | "actorEmployeeId">) { return digest({ id: row.id, scope: row.spaceScope, sessionVersion: row.sessionVersion, user: row.actorUserId, employee: row.actorEmployeeId }); }
const options = { timeout: 30000, maxWait: 30000 };
export async function prepareSpace(db: PrismaClient, s: FacilitySession, scope: SpaceScope, device: Device) {
    return importTransaction(db, async (tx) => {
        const now = new Date(), c = await catalog(tx, s, scope, device, now);
        const row = await tx.offlineBundleIssuance.create({ data: { facilityId: s.facilityId, unitId: scope.unitId, actorUserId: sessionUserIdForFk(s), actorEmployeeId: s.authKind === "employee" ? s.uid : null, actorRole: s.role, authMethod: s.authMethod, deviceFacilityId: s.facilityId, deviceBoundUnitId: device.unitId, sessionVersion: s.sessionVersion!, bundleVersion: PROTOCOL, serverRevision: digest(c.targets), offlineAuthorizedUntil: new Date(c.until), spaceScope: json({ ...scope, operationalDate: c.operationalDate }), recoveryAfter: now } });
        const bundle: SpaceBundle = { protocol: PROTOCOL, issuanceId: row.id, scope, actorRef: actorRefForSession(s), sessionVersion: s.sessionVersion!, operationalDate: c.operationalDate, issuedAt: now.toISOString(), expiresAt: new Date(c.until).toISOString(), label: c.space.name, timezone: c.facility.timezone, targets: c.targets, reviewDigest: digest({ scope, targets: c.targets, issuedAt: now.toISOString() }) };
        if (Buffer.byteLength(JSON.stringify(bundle)) > LIMITS.bundleBytes)
            fail("Offline bundle exceeds 512 KiB.");
        const key = randomBytes(32);
        await tx.offlineBundleIssuance.update({ where: { id: row.id }, data: { spaceManifest: json(bundle), recoveryKeyEnvelope: json(escrowKey(key, aad(row))) } });
        await authorize(tx, s, scope, device, new Date());
        return { bundle, key: key.toString("base64") };
    }, options);
}
export async function recoverSpace(db: PrismaClient, s: FacilitySession, id: string, reviewDigest: string, device: Device, proof: string) {
    return importTransaction(db, async (tx) => {
        const row = await tx.offlineBundleIssuance.findUniqueOrThrow({ where: { id } });
        owned(row, s);
        const bundle = row.spaceManifest as unknown as SpaceBundle;
        await authorize(tx, s, bundle.scope, device, new Date());
        await tx.$queryRaw `SELECT "id" FROM "OfflineBundleIssuance" WHERE "id"=${id} FOR UPDATE`;
        const current = await tx.offlineBundleIssuance.findUniqueOrThrow({ where: { id } });
        if (reviewDigest !== bundle.reviewDigest || !readCredentialProof(proof, actorRefForSession(s), s.sessionVersion!, +(current.recoveryAfter || current.issuedAt)))
            fail("Authenticate again online and explicitly review this issuance before recovery.");
        await authorize(tx, s, bundle.scope, device, new Date());
        await tx.offlineBundleIssuance.update({ where: { id }, data: { recoveryAfter: new Date() } });
        return { bundle, key: openEscrow(current.recoveryKeyEnvelope, aad(current)).toString("base64"), reviewOnly: +current.offlineAuthorizedUntil <= Date.now() };
    }, options);
}
function result(id: string, status: Outcome["status"], message: string, recordId?: string): Outcome { return { id, status, message, ...(recordId ? { recordId } : {}) }; }
export async function syncSpace(db: PrismaClient, s: FacilitySession, commands: SpaceCommand[], device: Device, reconcile = false, reviewedExpired = false, proof = "") {
    const outcomes: Outcome[] = [];
    for (const cmd of commands) {
        if (Buffer.byteLength(JSON.stringify(cmd)) > LIMITS.commandBytes) {
            outcomes.push(result(cmd.id, "blocked", "Command exceeds 8 KiB."));
            continue;
        }
        try {
            outcomes.push(await importTransaction(db, async (tx) => {
                const issuance = await tx.offlineBundleIssuance.findUniqueOrThrow({ where: { id: cmd.issuanceId } });
                owned(issuance, s);
                const bundle = issuance.spaceManifest as unknown as SpaceBundle;
                const context = await authorize(tx, s, bundle.scope, device, new Date(), bundle.operationalDate);
                // Natural target parents are locked before absence checks; canonical writers
                // also share these rows. Serializable protects writers not using these locks.
                await tx.$queryRaw `SELECT "id" FROM "OfflineBundleIssuance" WHERE "id"=${issuance.id} FOR UPDATE`;
                const where = { facilityId_unitId_clientCommandId: { facilityId: s.facilityId, unitId: bundle.scope.unitId, clientCommandId: cmd.id } };
                const prior = await tx.offlineSyncReceipt.findUnique({ where });
                const intent = digest(cmd);
                if (prior) {
                    if (prior.intentDigest !== intent || prior.issuanceId !== issuance.id || prior.actorUserId !== sessionUserIdForFk(s) || prior.actorEmployeeId !== (s.authKind === "employee" ? s.uid : null))
                        return result(cmd.id, "blocked", "Command identity was already bound to a different intent or actor.");
                    return prior.outcome as unknown as Outcome;
                }
                if (reconcile)
                    return result(cmd.id, "unknown", "No authoritative receipt exists. Retry the same reviewed command identity.");
                const target = bundle.targets.find(t => t.id === cmd.target && t.kind === cmd.kind);
                if (!target || target.baseline !== cmd.baseline || !target.available)
                    fail("Target was not authorized in this issuance.");
                const expired = +issuance.offlineAuthorizedUntil <= Date.now();
                if (expired && (!reviewedExpired || !readCredentialProof(proof, actorRefForSession(s), s.sessionVersion!, +issuance.issuedAt)))
                    fail("Expired intent requires fresh same-actor online authentication and explicit review.");
                if (new Date(cmd.occurredAt).getTime() < +issuance.issuedAt - 60000 || new Date(cmd.occurredAt).getTime() > +issuance.offlineAuthorizedUntil || new Date(cmd.occurredAt).getTime() > Date.now() + 60000)
                    fail("Claimed occurrence time is outside the authorized interval; review online.");
                const live = await catalog(tx, s, bundle.scope, device, new Date(), bundle.operationalDate);
                const current = live.targets.find(t => t.id === cmd.target && t.kind === cmd.kind);
                let outcome: Outcome;
                if (!current || current.baseline !== cmd.baseline || s.sessionVersion !== issuance.sessionVersion)
                    outcome = result(cmd.id, "conflict", "Assignment, publication, scope or target facts changed. Review online.");
                else if (cmd.kind === "KEY_TIME_ACTUAL" && current.completed)
                    outcome = result(cmd.id, "conflict", "An actual already exists. Corrections are online-only.");
                else if (cmd.kind === "WORK") {
                    const requirement = live.requirements.get(cmd.target)!;
                    if (requirement.completionMode !== "EXPLICIT_CONFIRMATION")
                        fail("Canonical evidence is required; complete online.");
                    const done = await completeExplicit(s, { facilityId: s.facilityId, departmentId: bundle.scope.departmentId, requirement, operationalDate: bundle.operationalDate, actor: { userId: sessionUserIdForFk(s), employeeId: context.employee.id, label: s.name, authenticationMethod: s.authMethod }, note: cmd.note, clientCommandId: cmd.id, deviceBoundUnitId: device.unitId, recordedOnline: false, client: tx });
                    outcome = result(cmd.id, done.deduplicated ? "reused" : "committed", "Canonical Work confirmed.", done.occurrence.id);
                }
                else {
                    await tx.$queryRaw `SELECT "id" FROM "OperationalCycleKeyTimeDayExpectation" WHERE "id"=${cmd.target} FOR UPDATE`;
                    const local = new Intl.DateTimeFormat("en-GB", { timeZone: live.facility.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(cmd.occurredAt));
                    const done = await completeKeyTimeDayExpectation({ session: s, expectationId: cmd.target, actualDueLocal: local, now: new Date() }, tx);
                    if (!done.ok)
                        fail(done.reason);
                    const k = live.keyRows.get(cmd.target)!;
                    const actual = await tx.operationalCycleKeyPointActual.findFirstOrThrow({ where: { cycleId: k.cycleId, spaceId: k.spaceId, serviceDate: k.serviceDate }, orderBy: { recordedAt: "desc" } });
                    outcome = result(cmd.id, "committed", "Key Time actual recorded; corrections remain online-only.", actual.id);
                }
                if (outcome.status === "conflict")
                    await tx.offlineConflict.create({ data: { facilityId: s.facilityId, unitId: bundle.scope.unitId, clientCommandId: cmd.id, conflictCategory: "AUTHORITATIVE_STATE_CHANGED", commandPayload: json(cmd), authoritativeState: json({ target: current || null }), reasonCode: outcome.message } });
                await authorize(tx, s, bundle.scope, device, new Date(), bundle.operationalDate);
                await tx.offlineSyncReceipt.create({ data: { facilityId: s.facilityId, unitId: bundle.scope.unitId, clientCommandId: cmd.id, commandType: `space/1:${cmd.kind}`, actorUserId: sessionUserIdForFk(s), actorEmployeeId: s.authKind === "employee" ? s.uid : null, sessionVersion: s.sessionVersion!, deviceBoundUnitId: device.unitId, resultCategory: outcome.status === "conflict" ? "CONFLICT_REVIEW_REQUIRED" : "ACCEPTED", reasonCode: outcome.message, locallyRecordedAt: new Date(cmd.occurredAt), serverAcceptedAt: outcome.status === "conflict" ? null : new Date(), issuanceId: issuance.id, intentDigest: intent, authoritativeRecordId: outcome.recordId || null, outcome: json(outcome) } });
                return outcome;
            }, options));
        }
        catch (e) {
            outcomes.push(result(cmd.id, e instanceof SpaceOfflineError ? "blocked" : confirmedRollback(e) ? "failed" : "unknown", e instanceof SpaceOfflineError ? e.message : confirmedRollback(e) ? "This attempt rolled back after bounded retries. Reconcile the same command before retrying." : "Outcome uncertain. Reconcile this same command before retrying."));
        }
    }
    return outcomes;
}

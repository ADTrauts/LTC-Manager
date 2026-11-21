import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import test from "node:test";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { bootstrapFacilityCustomer } from "@/lib/facility-provisioning/bootstrap";
import { createHarborSessionToken, verifyHarborSessionToken } from "@/lib/harbor-console/session";
import { harborLoginIdentity } from "@/lib/harbor-console/login-receipt";
import { changeFacilityOperationsSuspension } from "@/lib/harbor-console/facility-suspension";
import { createExportRequest, decideExportRequest, downloadExport, listCustomerExports } from "@/lib/customer-record-exports/service";
import { createOffboardingRequest, customerOffboardingCommand, ownerOffboardingCommand, loadOffboardingRequest } from "./service";

const target = process.env.VERIFY_DATABASE_URL;

// Keep synthetic evidence: append-only governance and unexpired receipts must not be bypassed for cleanup.
test("Harbor v1 lifecycle boundaries on isolated PostgreSQL", { skip: !target && "requires local migrated PostgreSQL" }, async t => {
  assertDisposableDatabaseUrl(target);
  assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(target!).hostname));
  process.env.AUTH_SECRET ??= "harbor-closeout-local-only";
  const previousEnabled = process.env.CUSTOMER_OFFBOARDING_ENABLED;
  process.env.CUSTOMER_OFFBOARDING_ENABLED = "true";
  const db = new PrismaClient({ datasourceUrl: target });
  try {
    const key = randomUUID();
    const password = "Synthetic-closeout-password";
    const passwordHash = await bcrypt.hash(password, 4);
    await db.role.upsert({ where: { key: "FACILITY_ADMINISTRATOR" }, create: { key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" }, update: {} });
    async function facility(label: string) {
      const row = await db.$transaction(tx => bootstrapFacilityCustomer(tx, {
        organization: { mode: "create", facilityName: `Closeout ${label} ${key}` },
        facility: { displayName: `Closeout ${label} ${key}`, billingEmail: `${label}-${key}@example.invalid` },
        administrator: { mode: "create", displayName: `Closeout ${label} Administrator`, email: `${label}-${key}@example.invalid`, passwordHash, emailVerifiedAt: new Date() },
      }));
      const session: FacilitySession = { uid: row.user.id, name: row.user.displayName, email: row.user.email, facilityId: row.facility.id,
        scopeKind: "facility", authKind: "user", authMethod: "PASSWORD", role: "FACILITY_ADMINISTRATOR", sessionVersion: 0,
        jti: randomUUID(), exp: Math.floor(Date.now() / 1000) + 3600 };
      return { ...row, session };
    }
    async function staff(role: "OWNER" | "MEMBER") {
      const row = await db.platformStaff.create({ data: { email: `${role}-${key}@example.invalid`, displayName: role, role, passwordHash } });
      const login = () => createHarborSessionToken({ uid: row.id, email: row.email, name: row.displayName, staffRole: row.role, sessionVersion: row.sessionVersion }).then(verifyHarborSessionToken);
      return { row, session: await login(), login };
    }
    const a = await facility("A"), b = await facility("B"), owner = await staff("OWNER"), member = await staff("MEMBER");
    const department = await db.department.create({ data: { facilityId: a.facility.id, key: "PLANT", name: "Plant" } });
    const period = await db.departmentOperatorRelationship.create({ data: { departmentId: department.id, organizationId: a.organization.id, effectiveFrom: new Date("2026-01-01T00:00:00Z") } });
    const definition = await db.catalogLogDefinition.create({ data: { stableKey: `closeout-${key}`, name: "Synthetic Record", purposeType: "LOG", ownerKind: "VSSYL" } });
    const snapshot = { kind: "CANONICAL_LOG", snapshotSchemaVersion: 2, catalog: { id: definition.id, stableKey: definition.stableKey, version: 1, name: definition.name,
      fields: [{ fieldKey: "response", label: "Response", fieldType: "SHORT_TEXT", unitLabel: null }, { fieldKey: "attachment", label: "Excluded attachment", fieldType: "FILE" }] } };
    const record = await db.operationalEvidenceRecord.create({ data: {
      facilityId: a.facility.id, departmentId: department.id, operatorPeriodId: period.id, catalogDefinitionId: definition.id,
      templateStableKey: definition.stableKey, templateVersion: 1, templateName: definition.name, purposeType: "LOG", requirementKey: randomUUID(),
      operationalDate: new Date("2026-11-20T00:00:00Z"), occurredAt: new Date("2026-11-20T12:00:00Z"), scheduleKind: "AD_HOC", templateSnapshotJson: snapshot,
      values: { create: [{ fieldKey: "response", label: "Response", fieldType: "SHORT_TEXT", valueText: "=SUM(1,2)" }, { fieldKey: "attachment", label: "Excluded attachment", fieldType: "FILE", valueText: "PRIVATE_ATTACHMENT_CANARY" }] },
    } });
    const request = { id: randomUUID(), requestedDate: "2026-12-01", reason: "Customer requests a shared closure plan." };
    const plan = { targetDate: "2026-12-01", billing: { reviewed: true, notes: "Billing remains deliberate." }, exports: { reviewed: true, notes: "Limited exports remain deliberate." }, access: { reviewed: true, notes: "Access changes remain deliberate." }, preservation: { reviewed: true, notes: "Data is preserved without deletion." } };
    const suspend = { facilityId: a.facility.id, operation: "suspend" as const, expectedRevision: 0, requestKey: randomUUID(), reason: "Synthetic manual pause", confirmationName: a.facility.displayName, password };

    await t.test("suspension requires OWNER/password and exact retries create one audited transition", async () => {
      assert.equal((await changeFacilityOperationsSuspension(db, member.session, suspend)).ok, false);
      assert.equal((await changeFacilityOperationsSuspension(db, owner.session, { ...suspend, password: "wrong" })).ok, false);
      const results = await Promise.all(Array.from({ length: 3 }, () => changeFacilityOperationsSuspension(db, owner.session, suspend)));
      assert(results.every(r => r.ok));
      assert.equal(await db.harborFacilitySuspensionAuditDetail.count({ where: { facilityId: a.facility.id } }), 1);
      assert.equal((await db.facility.findUniqueOrThrow({ where: { id: a.facility.id } })).operationsSuspensionRevision, 1);
      assert.equal((await changeFacilityOperationsSuspension(db, owner.session, { ...suspend, reason: "Conflicting reference" })).ok, false);
      await assert.rejects(db.unitSpace.create({ data: { facilityId: a.facility.id, name: "Must remain blocked", spaceType: "PATIENT_ROOM" } }), /paused|suspend/i);
      assert.equal(await db.operationalEvidenceRecord.count({ where: { id: record.id } }), 1);
    });

    const exportInput = { id: randomUUID(), departmentId: department.id, recordKey: definition.stableKey, fromDate: "2026-11-20", toDate: "2026-11-20", format: "csv" };
    await t.test("limited exports remain usable during a pause and require original Administrator plus OWNER approval", async () => {
      await assert.rejects(createExportRequest(db, b.session, exportInput));
      assert.equal(await createExportRequest(db, a.session, exportInput), exportInput.id);
      assert.equal(await createExportRequest(db, a.session, exportInput), exportInput.id);
      await assert.rejects(createExportRequest(db, a.session, { ...exportInput, format: "xlsx" }), /reference/i);
      await assert.rejects(downloadExport(db, a.session, exportInput.id), /approval/i);
      await assert.rejects(decideExportRequest(db, member.session, exportInput.id, 0, "APPROVED"), /OWNER/);
      await decideExportRequest(db, owner.session, exportInput.id, 0, "APPROVED");
      const approved = await db.customerRecordExportRequest.findUniqueOrThrow({ where: { id: exportInput.id } });
      assert.equal(+approved.expiresAt! - +approved.approvedAt!, 86400000);
      const currentList = await listCustomerExports(db, a.session);
      assert(+currentList.rows.find(row => row.id === exportInput.id)!.expiresAt! > currentList.evaluatedAt);
      await assert.rejects(downloadExport(db, b.session, exportInput.id), /not found/i);
      const artifact = await downloadExport(db, a.session, exportInput.id);
      assert.match(artifact.bytes.toString(), /'\=SUM\(1,2\)/);
      assert.doesNotMatch(artifact.bytes.toString(), /PRIVATE_ATTACHMENT_CANARY|Excluded attachment/);
      assert.equal(await db.customerRecordExportEvent.count({ where: { requestId: exportInput.id, action: "GENERATED" } }), 1);
      const xlsx = { ...exportInput, id: randomUUID(), format: "xlsx" };
      await createExportRequest(db, a.session, xlsx);
      await decideExportRequest(db, owner.session, xlsx.id, 0, "APPROVED");
      const workbook = new ExcelJS.Workbook();
      const spreadsheet = await downloadExport(db, a.session, xlsx.id);
      await workbook.xlsx.read(Readable.from([spreadsheet.bytes]));
      assert.equal(workbook.getWorksheet("Responses")!.getCell("K2").type, ExcelJS.ValueType.String);
      assert.equal(workbook.getWorksheet("Responses")!.getCell("K2").value, "=SUM(1,2)");
      const realNow = Date.now;
      try {
        Date.now = () => +approved.expiresAt! + 1;
        const laterSession = { ...a.session, exp: Math.floor(Date.now() / 1000) + 3600 };
        const expiredList = await listCustomerExports(db, laterSession);
        assert.equal(expiredList.evaluatedAt, Date.now());
        assert(+expiredList.rows.find(row => row.id === exportInput.id)!.expiresAt! <= expiredList.evaluatedAt);
        await assert.rejects(downloadExport(db, laterSession, exportInput.id), /approval/i);
      } finally { Date.now = realNow; }
      await decideExportRequest(db, owner.session, exportInput.id, 1, "REVOKED");
      await assert.rejects(downloadExport(db, a.session, exportInput.id), /approval/i);
    });

    await t.test("offboarding retries, isolation and revised plans preserve one shared audit history without closing service", async () => {
      const before = await db.facility.findUniqueOrThrow({ where: { id: a.facility.id } });
      assert.deepEqual(await Promise.all(Array.from({ length: 3 }, () => createOffboardingRequest(db, a.session, request))), [request.id, request.id, request.id]);
      assert.equal(await db.customerOffboardingEvent.count({ where: { requestId: request.id } }), 1);
      await assert.rejects(createOffboardingRequest(db, a.session, { ...request, reason: "Conflicting retry reason" }), /reference/i);
      await assert.rejects(createOffboardingRequest(db, a.session, { ...request, id: randomUUID() }), /already has an open/i);
      await assert.rejects(loadOffboardingRequest(db, { kind: "CUSTOMER", session: b.session }, request.id), /not found/i);
      const publish = { commandId: randomUUID(), requestId: request.id, revision: 0, action: "PUBLISH_PLAN", plan };
      await assert.rejects(ownerOffboardingCommand(db, member.session, publish), /OWNER/i);
      await ownerOffboardingCommand(db, owner.session, publish);
      await ownerOffboardingCommand(db, owner.session, publish);
      await customerOffboardingCommand(db, a.session, { commandId: randomUUID(), requestId: request.id, revision: 1, action: "ACKNOWLEDGE" });
      await ownerOffboardingCommand(db, owner.session, { ...publish, commandId: randomUUID(), revision: 2, plan: { ...plan, targetDate: "2026-12-02" } });
      await assert.rejects(customerOffboardingCommand(db, a.session, { commandId: randomUUID(), requestId: request.id, revision: 1, action: "ACKNOWLEDGE" }), /changed/i);
      const view = await loadOffboardingRequest(db, { kind: "CUSTOMER", session: a.session }, request.id);
      assert.equal(view.row.status, "PLAN_READY"); assert.equal(view.row.planVersion, 2);
      assert.deepEqual(view.events.map(e => e.actorKind), ["OWNER", "CUSTOMER", "OWNER", "CUSTOMER"]);
      const after = await db.facility.findUniqueOrThrow({ where: { id: a.facility.id } });
      assert.deepEqual(after, before);
      await assert.rejects(db.customerOffboardingEvent.update({ where: { id: request.id }, data: { actorLabel: "Tamper" } }), /append|immutable/i);
      await assert.rejects(db.customerOffboardingRequest.update({ where: { id: request.id }, data: { revision: 4, status: "WITHDRAWN" } }), /receipt|event|audit/i);
      assert.equal((await db.customerOffboardingRequest.findUniqueOrThrow({ where: { id: request.id } })).revision, 3);
    });

    await t.test("reactivation restores operational writes; vendor ownership prevents report generation", async () => {
      assert.equal((await changeFacilityOperationsSuspension(db, owner.session, { ...suspend, operation: "reactivate", expectedRevision: 1, requestKey: randomUUID() })).ok, true);
      await db.unitSpace.create({ data: { facilityId: a.facility.id, name: "Allowed after reactivation", spaceType: "PATIENT_ROOM" } });
      await db.departmentOperatorRelationship.update({ where: { id: period.id }, data: { organizationId: b.organization.id } });
      await assert.rejects(createExportRequest(db, a.session, { ...exportInput, id: randomUUID() }), /self-operated|vendor/i);
    });

    await t.test("exact Harbor logout blocks lifecycle decisions while a second login and customer authority survive", async () => {
      const other = await owner.login();
      const login = harborLoginIdentity(owner.session)!;
      await db.harborAssistanceLoginReceipt.create({ data: { loginKey: login.key, retainUntil: login.retainUntil } });
      const decline = { commandId: randomUUID(), requestId: request.id, revision: 3, action: "DECLINE", reason: "Synthetic closeout review finished." };
      await assert.rejects(ownerOffboardingCommand(db, owner.session, decline), /OWNER/i);
      assert.equal((await loadOffboardingRequest(db, { kind: "CUSTOMER", session: a.session }, request.id)).row.status, "PLAN_READY");
      await ownerOffboardingCommand(db, other, decline);
      assert.equal((await loadOffboardingRequest(db, { kind: "OWNER", session: other }, request.id)).row.status, "DECLINED");
      const stale = { ...request, id: randomUUID() };
      await createOffboardingRequest(db, a.session, stale);
      await db.userFacilityRolePeriod.updateMany({ where: { userFacilityAccess: { userId: a.user.id }, endsAt: null }, data: { endsAt: new Date() } });
      await assert.rejects(customerOffboardingCommand(db, a.session, { commandId: randomUUID(), requestId: stale.id, revision: 0, action: "WITHDRAW" }), /Administrator/i);
      await assert.rejects(ownerOffboardingCommand(db, other, { commandId: randomUUID(), requestId: stale.id, revision: 0, action: "PUBLISH_PLAN", plan }), /no longer holds the seat/i);
      await ownerOffboardingCommand(db, other, { ...decline, commandId: randomUUID(), requestId: stale.id, revision: 0 });
      process.env.CUSTOMER_OFFBOARDING_ENABLED = "false";
      await assert.rejects(createOffboardingRequest(db, a.session, { ...request, id: randomUUID() }), /not available/i);
    });
  } finally {
    if (previousEnabled === undefined) delete process.env.CUSTOMER_OFFBOARDING_ENABLED;
    else process.env.CUSTOMER_OFFBOARDING_ENABLED = previousEnabled;
    await db.$disconnect();
  }
});

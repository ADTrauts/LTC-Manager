import { randomUUID } from "node:crypto";
import type { PrismaClient, SupportMessageDeliveryStatus } from "@prisma/client";
import { bootstrapFacilityCustomer } from "../../src/lib/facility-provisioning/bootstrap";
import { createHarborSessionToken, verifyHarborSessionToken } from "../../src/lib/harbor-console/session";

/** Synthetic local fixtures only. Credentials are supplied in memory by browser tests. */
export async function createHarborOperationsFixture(db: PrismaClient, options: { bulk?: number; passwordHash?: string } = {}) {
  const key = randomUUID();
  const old = new Date("1901-01-01T00:00:00Z");
  await db.role.upsert({ where: { key: "FACILITY_ADMINISTRATOR" }, create: { key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" }, update: {} });
  async function facility(label: string) {
    return db.$transaction((tx) => bootstrapFacilityCustomer(tx, {
      organization: { mode: "create", facilityName: `000000 Operations ${label} ${key}` },
      facility: { displayName: `000000 Operations ${label} ${key}`, billingEmail: `${label}-${key}@example.invalid` },
      administrator: { mode: "create", displayName: `Synthetic ${label} Administrator`, email: `${label}-${key}@example.invalid`, passwordHash: options.passwordHash ?? null, emailVerifiedAt: new Date() },
    }));
  }
  const [a, b] = await Promise.all([facility("A"), facility("B")]);
  await db.unitSpace.createMany({ data: [a, b].map((fixture) => ({ facilityId: fixture.facility.id, name: "PRIVATE_UNLINKED_ROOM_CANARY", spaceType: "PATIENT_ROOM" })) });
  async function staff(role: "OWNER" | "MEMBER") {
    const row = await db.platformStaff.create({ data: { role, displayName: `Synthetic Operations ${role}`, email: `${role.toLowerCase()}-${key}@example.invalid`, passwordHash: options.passwordHash ?? "unused-synthetic-hash" } });
    const session = await verifyHarborSessionToken(await createHarborSessionToken({ uid: row.id, name: row.displayName, email: row.email, staffRole: role, sessionVersion: row.sessionVersion }));
    return { row, session };
  }
  const [owner, member] = await Promise.all([staff("OWNER"), staff("MEMBER")]);
  const contact = await db.supportContact.create({ data: { email: `${key}@example.invalid`, facilityId: a.facility.id } });
  // Ordering uses updatedAt, but creation must stay current so unrelated historical automation clocks cannot claim these tickets.
  const ticket = await db.supportTicket.create({ data: { contactId: contact.id, facilityId: a.facility.id, replyToken: key.replaceAll("-", ""), subject: "PRIVATE BODY AND SUBJECT CANARY", priority: "HIGH", updatedAt: old } });
  const bulkIds = Array.from({ length: options.bulk ?? 0 }, () => randomUUID());
  await db.supportTicket.createMany({ data: bulkIds.map((id) => ({ id, contactId: contact.id, replyToken: id.replaceAll("-", ""), subject: "PRIVATE BULK SUBJECT", updatedAt: old })) });
  const inbound = await db.supportTicketMessage.create({ data: { ticketId: ticket.id, kind: "INBOUND", contactId: contact.id, bodyText: "PRIVATE ORIGINAL BODY", createdAt: old } });
  const messages = new Map<SupportMessageDeliveryStatus, string>();
  for (const deliveryStatus of ["FAILED", "BOUNCED", "SPAM_COMPLAINT", "PENDING", "SENT", "DELIVERED"] as const) {
    const row = await db.supportTicketMessage.create({ data: { ticketId: ticket.id, kind: "OUTBOUND", authorStaffId: owner.row.id, clientSubmissionId: randomUUID(), bodyText: "PRIVATE REPLY CANARY", deliveryStatus, createdAt: old, sentAt: deliveryStatus === "PENDING" ? null : old } });
    messages.set(deliveryStatus, row.id);
  }
  const scans = new Map<string, string>();
  for (const state of ["eligible", "expired", "leased", "scheduled", "failed", "blocked", "clean"] as const) {
    const row = await db.supportTicketAttachment.create({ data: {
      messageId: inbound.id, position: scans.size, filename: "PRIVATE_FILENAME_CANARY.csv", contentType: "text/csv", sizeBytes: 1,
      scanStatus: state === "failed" ? "SCAN_FAILED" : state === "blocked" ? "BLOCKED" : state === "clean" ? "CLEAN" : "PENDING",
      scanCycle: state === "failed" ? 4 : 1, scanResultCode: state === "failed" ? "HASH_MISMATCH" : null,
      scanLeaseExpiresAt: state === "leased" ? new Date(Date.now() + 3600000) : state === "expired" ? old : null,
      nextScanAt: state === "scheduled" ? new Date(Date.now() + 3600000) : null,
      storageKey: "PRIVATE_STORAGE_KEY_CANARY", checksumSha256: "a".repeat(64), createdAt: old,
    } });
    scans.set(state, row.id);
  }
  const failed = scans.get("failed")!;
  await db.supportAttachmentScanAttempt.createMany({ data: Array.from({ length: 11 }, (_, i) => ({ id: randomUUID(), attachmentId: failed, cycle: Math.floor(i / 3) + 1, attempt: i % 3 + 1, expectedSha256: "a".repeat(64), expectedSizeBytes: 1, status: "FAILED", resultCode: i === 10 ? "HASH_MISMATCH" : "TRANSPORT", createdAt: new Date(+old + i), finishedAt: new Date(+old + i) })) });
  const rule = await db.supportAutomationRule.create({ data: { name: `Operations rule ${key}`, type: "WAITING_RESOLVE", delayMinutes: 14400, createdByStaffId: owner.row.id } });
  const run = await db.supportAutomationRun.create({ data: { ruleId: rule.id, ticketId: ticket.id, action: "RESOLVE_AFTER_WAIT", outcome: "FAILED", dedupeKey: randomUUID(), occurredAt: new Date("2090-01-01T00:00:00Z"), reason: "PRIVATE_PROVIDER_ERROR_CANARY" } });
  const billing = await db.facilityBilling.create({ data: { facilityId: a.facility.id, status: "PAST_DUE", entitlements: { create: { facilityId: a.facility.id, departmentKey: "PLANT", status: "ACTIVE" } } } });
  const records = [];
  for (const ownerKind of ["VSSYL", "FACILITY", "ORGANIZATION"] as const) records.push(await db.catalogLogDefinition.create({ data: {
    stableKey: `operations-${ownerKind}-${key}`, name: ownerKind === "VSSYL" ? `Platform Operations ${key}` : "PRIVATE_RECORD_CANARY", purposeType: "LOG", ownerKind,
    ownerFacilityId: ownerKind === "FACILITY" ? a.facility.id : null, ownerOrganizationId: ownerKind === "ORGANIZATION" ? b.organization.id : null, updatedAt: old,
  } }));
  const engagement = await db.implementationEngagement.create({ data: { facilityId: a.facility.id, requesterUserId: a.user.id, supportTicketId: ticket.id, responsibleStaffId: member.row.id, requestedScope: { departmentKeys: ["PLANT"], deliverables: ["PRIVATE_SCOPE_CANARY"] }, participants: { create: [{ staffId: member.row.id }, { userId: a.user.id }] } } });
  return { a, b, owner, member, ticket, contact, inbound, bulkIds, messages, scans, rule, run, billing, records, engagement };
}

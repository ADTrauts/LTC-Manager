import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { upsertSupportContact } from "@/lib/support/contacts";
import { generateSupportReplyToken } from "@/lib/support/identifiers";
import { persistInboundSupportAttachments } from "@/lib/support/attachments";
import type { SupportAttachmentStore } from "@/lib/support/attachment-store";
import { SUPPORT_ATTACHMENT_MAX_BYTES } from "@/lib/support/attachment-limits";
import { loadCustomerOperableDepartments } from "@/lib/department-products/load-facility-catalog";
import type { PlanRow } from "@/lib/setup-imports/contract";
import { appendEvent, authorize, lockEngagement, requireParticipant, type Actor, type Db, type Tx } from "./authority";
import { deliveryEvidence, digest, ImplementationError, parseScope, quoteScope, STAGES } from "./contract";
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const transaction = <T>(db: PrismaClient, fn: (tx: Tx) => Promise<T>) => db.$transaction(fn,{ timeout: 30000, maxWait: 30000 });
function customer(actor: Actor) { if (actor.kind !== "customer") throw new ImplementationError("Customer Facility Administrator approval is required."); return actor.session; }
function staff(actor: Actor) { if (actor.kind !== "staff") throw new ImplementationError("Console staff action is required."); return actor.session; }
function editable(row: { acceptedAt: Date | null }) { if (row.acceptedAt) throw new ImplementationError("This handoff is accepted. Request a separate engagement for later work."); }
export async function requestEngagement(db: PrismaClient, actor: Actor, facilityId: string, input: unknown) {
  const session = customer(actor); const scope = parseScope(input);
  return transaction(db,async tx => {
    await authorize(tx,actor,facilityId,true);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id"=${facilityId} FOR UPDATE`);
    await authorize(tx,actor,facilityId);
    const contact = await upsertSupportContact(tx,{ email: session.email, displayName: session.name });
    // Customer-originated support intake uses its actual contact. No invented PlatformStaff actor.
    const ticket = await tx.supportTicket.create({ data: { replyToken: generateSupportReplyToken(), subject: "VSSYL implementation engagement", facilityId, contactId: contact.id, status: "NEW" } });
    const engagement = await tx.implementationEngagement.create({ data: { facilityId, requesterUserId: session.uid, supportTicketId: ticket.id, requestedScope: json(scope), participants: { create: { userId: session.uid } } } });
    await tx.supportTicketEvent.create({ data: { ticketId: ticket.id, type: "CREATED", metadata: { source: "IMPLEMENTATION", engagementId: engagement.id, actorUserId: session.uid } } });
    await appendEvent(tx,actor,engagement.id,"REQUESTED",json(scope));
    return engagement.id;
  });
}
export async function assignEngagement(db: PrismaClient, actor: Actor, engagementId: string, responsibleStaffId: string) {
  const session = staff(actor);
  return transaction(db,async tx => {
    const row = await lockEngagement(tx,actor,engagementId,false); editable(row);
    // Members may claim unassigned work themselves. Only an Owner may replace responsibility.
    if (session.staffRole !== "OWNER" && (row.responsibleStaffId || responsibleStaffId !== session.uid)) throw new ImplementationError("An Owner must change an existing assignment.");
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PlatformStaff" WHERE "id"=${responsibleStaffId} FOR SHARE`);
    const responsible = await tx.platformStaff.findFirst({ where: { id: responsibleStaffId, isActive: true } });
    if (!responsible) throw new ImplementationError("Choose active responsible Console staff.");
    await tx.implementationEngagement.update({ where: { id: row.id }, data: { responsibleStaffId, deliveryRevision: { increment: 1 } } });
    for (const id of new Set([responsibleStaffId,session.uid])) await tx.implementationParticipant.upsert({ where: { engagementId_staffId: { engagementId, staffId: id } }, create: { engagementId, staffId: id }, update: {} });
    await tx.supportTicket.update({ where: { id: row.supportTicketId }, data: { assignedStaffId: responsibleStaffId } });
    await appendEvent(tx,actor,engagementId,"ASSIGNED",{ responsibleStaffId });
  });
}
export async function addParticipant(db: PrismaClient, actor: Actor, engagementId: string, userId: string) {
  customer(actor);
  return transaction(db,async tx => {
    const row = await lockEngagement(tx,actor,engagementId); editable(row);
    // A live internal FA can be invited to review, never an arbitrary contact/email label.
    const user = await tx.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user?.isActive || user.facilityId !== row.facilityId || user.role?.key !== "FACILITY_ADMINISTRATOR") throw new ImplementationError("Choose an active internal Facility Administrator in this Facility.");
    await tx.implementationParticipant.upsert({ where: { engagementId_userId: { engagementId, userId } }, create: { engagementId, userId }, update: {} });
    await appendEvent(tx,actor,engagementId,"PARTICIPANT_ADDED",{ userId });
  });
}
export async function issueQuote(db: PrismaClient, actor: Actor, engagementId: string, expectedRevision: number, input: unknown, waiverReason?: string) {
  const session = staff(actor);
  if (waiverReason && session.staffRole !== "OWNER") throw new ImplementationError("Only a Console Owner may authorize a service-fee waiver.");
  const quote = quoteScope(input,waiverReason ? { staffId: session.uid, reason: waiverReason } : undefined);
  return transaction(db,async tx => {
    const row = await lockEngagement(tx,actor,engagementId); editable(row);
    if (!row.responsibleStaffId) throw new ImplementationError("Assign responsible staff before issuing scope.");
    if (row.revision !== expectedRevision) throw new ImplementationError("Scope revision changed. Reload before quoting.");
    if (await tx.implementationOrder.findFirst({ where: { engagementId, approvedAt: { not: null } } })) throw new ImplementationError("An approved scope is immutable. Later or changed work needs a separately approved engagement.");
    await tx.implementationOrder.updateMany({ where: { engagementId, status: "QUOTED" }, data: { status: "SUPERSEDED" } });
    const order = await tx.implementationOrder.create({ data: { engagementId, revision: row.revision+1, scope: json(quote.scope), digest: quote.digest, amountCents: quote.amountCents, currency: quote.currency, waivedByStaffId: quote.waiver?.staffId, waiverReason: quote.waiver?.reason } });
    await tx.implementationEngagement.update({ where: { id: row.id }, data: { revision: order.revision, deliveryRevision: { increment: 1 } } });
    await appendEvent(tx,actor,engagementId,"QUOTED",{ orderId: order.id, revision: order.revision, authorizedStaffRole: session.staffRole, ...json(quote) as object });
    return order;
  });
}
export async function approveQuote(db: PrismaClient, actor: Actor, engagementId: string, orderId: string, expectedDigest: string) {
  const session = customer(actor);
  return transaction(db,async tx => {
    const row = await lockEngagement(tx,actor,engagementId); editable(row);
    const order = await tx.implementationOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.engagementId !== row.id || order.revision !== row.revision || order.digest !== expectedDigest || order.status === "SUPERSEDED") throw new ImplementationError("Quote changed. Review and approve the current scope and price.");
    if (order.approvedAt) return order;
    if (order.status !== "QUOTED") throw new ImplementationError("This quote is not awaiting approval.");
    // Revalidate published Product scope and price, but a later Owner role change does not undo a valid recorded waiver.
    const quote = quoteScope(order.scope,order.waivedByStaffId ? { staffId: order.waivedByStaffId, reason: order.waiverReason! } : undefined);
    if (quote.digest !== order.digest || quote.amountCents !== order.amountCents) throw new ImplementationError("Quote policy changed. Obtain a revised quote.");
    const approved = await tx.implementationOrder.update({ where: { id: order.id }, data: { approvedByUserId: session.uid, approvedAt: new Date(), status: order.amountCents === 0 ? "WAIVED" : "APPROVED" } });
    await tx.implementationEngagement.update({ where: { id: row.id }, data: { deliveryRevision: { increment: 1 } } });
    await appendEvent(tx,actor,row.id,"SCOPE_APPROVED",{ orderId, digest: expectedDigest, amountCents: order.amountCents, currency: order.currency });
    return approved;
  });
}
export async function recordDelivery(db: PrismaClient, actor: Actor, engagementId: string, input: unknown) {
  staff(actor); const evidence = deliveryEvidence(input);
  return transaction(db,async tx => {
    const row = await lockEngagement(tx,actor,engagementId); editable(row);
    const order = await tx.implementationOrder.findFirst({ where: { engagementId, revision: row.revision, status: { in: ["PAID","WAIVED"] } } });
    if (!order) throw new ImplementationError("Delivery evidence requires a customer-approved paid or waived order.");
    await appendEvent(tx,actor,engagementId,"DELIVERY",json({ ...evidence, deliveryRevision: row.deliveryRevision+1 }));
    await tx.implementationEngagement.update({ where: { id: row.id }, data: { deliveryRevision: { increment: 1 } } });
  });
}
export async function recordMappingDecision(db: PrismaClient, actor: Actor, engagementId: string, notes: string, sourceMessageId: string | null) {
  staff(actor);
  if (notes.trim().length < 3 || notes.length > 4000) throw new ImplementationError("Describe the mapping, unresolved questions and the ONB-04 dataset/columns.");
  return transaction(db,async tx => {
    const row = await lockEngagement(tx,actor,engagementId); editable(row);
    if (sourceMessageId && !await tx.implementationEvent.findFirst({ where: { engagementId, kind: "SOURCE_RECEIVED", data: { path: ["messageId"], equals: sourceMessageId } } })) throw new ImplementationError("Choose a source explicitly received for this engagement.");
    await appendEvent(tx,actor,engagementId,"MAPPING_DECISION",{ notes: notes.trim(), sourceMessageId });
    await tx.implementationEngagement.update({ where: { id: row.id }, data: { deliveryRevision: { increment: 1 } } });
  });
}
export async function receiveSource(db: PrismaClient, actor: Actor, engagementId: string, input: { submissionId: string; filename: string; contentType: string; bytes: Uint8Array }, store?: SupportAttachmentStore | null) {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(input.submissionId) || !input.bytes.length || input.bytes.length > SUPPORT_ATTACHMENT_MAX_BYTES) throw new ImplementationError("Choose a non-empty source file up to 10 MB and a valid retry identifier.");
  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  const receipt = await transaction(db,async tx => {
    const row = await lockEngagement(tx,actor,engagementId); editable(row);
    const ticket = await tx.supportTicket.findUniqueOrThrow({ where: { id: row.supportTicketId } });
    if (ticket.facilityId !== row.facilityId || ticket.status === "CLOSED") throw new ImplementationError("The source support conversation is unavailable. Ask responsible staff to reopen it.");
    const key = `implementation:${input.submissionId}`;
    const prior = await tx.supportTicketMessage.findUnique({ where: { clientSubmissionId: key } });
    if (prior) {
      const event = await tx.implementationEvent.findFirst({ where: { engagementId, kind: "SOURCE_RECEIVED", data: { path: ["messageId"], equals: prior.id } } });
      const data = event?.data as { checksum?: string; actorId?: string } | undefined;
      if (prior.ticketId !== ticket.id || data?.checksum !== checksum || data.actorId !== actor.session.uid) throw new ImplementationError("Retry identifier belongs to different source data or actor.");
      return { messageId: prior.id, ticketId: ticket.id };
    }
    const common = { ticketId: ticket.id, bodyText: "Implementation source intake. No import or configuration mutation authorized.", clientSubmissionId: key };
    const sourceContact = actor.kind === "customer" ? await upsertSupportContact(tx,{ email: actor.session.email, displayName: actor.session.name }) : null;
    const message = actor.kind === "staff" ? await tx.supportTicketMessage.create({ data: { ...common, kind: "NOTE", authorStaffId: actor.session.uid } }) : await tx.supportTicketMessage.create({ data: { ...common, kind: "INBOUND", contactId: sourceContact!.id, fromEmail: actor.session.email, fromName: actor.session.name, receivedAt: new Date() } });
    await appendEvent(tx,actor,row.id,"SOURCE_RECEIVED",{ messageId: message.id, checksum, actorId: actor.session.uid, filename: input.filename, sizeBytes: input.bytes.length });
    await tx.implementationEngagement.update({ where: { id: row.id }, data: { deliveryRevision: { increment: 1 } } });
    return { messageId: message.id, ticketId: ticket.id };
  });
  // Existing private attachment owner handles storage and quarantine. Never parse customer originals or mark CLEAN.
  const attachments = await persistInboundSupportAttachments(db,{ ...receipt, attachments: [{ name: input.filename, contentType: input.contentType, contentLength: input.bytes.length, contentId: null }], contents: [Buffer.from(input.bytes).toString("base64")], store });
  return { ...receipt, attachments };
}
export async function linkImport(db: PrismaClient, actor: Actor, engagementId: string, batchId: string) {
  return transaction(db,async tx => {
    const row = await lockEngagement(tx,actor,engagementId); editable(row);
    const order = await tx.implementationOrder.findFirst({ where: { engagementId, revision: row.revision, status: { in: ["PAID","WAIVED"] } } });
    if (!order) throw new ImplementationError("Link results only to a customer-approved paid or waived scope.");
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SetupImportBatch" WHERE "id"=${batchId} FOR UPDATE`);
    const batch = await tx.setupImportBatch.findUniqueOrThrow({ where: { id: batchId } });
    if (!["workforce","employee_departments","department_locations","assets"].includes(batch.dataset)) throw new ImplementationError("Share the canonical dataset child receipt, not a workbook aggregate or unsupported dataset.");
    const originalActor = actor.kind === "customer" ? batch.actorKind === "user" && batch.actorUserId === actor.session.uid : batch.actorKind === "harbor_staff" && batch.actorStaffId === actor.session.uid;
    if (batch.facilityId !== row.facilityId || !originalActor) throw new ImplementationError("Only the original executing actor may explicitly share this Facility's receipts.");
    if (batch.leaseExpiresAt && +batch.leaseExpiresAt > Date.now()) throw new ImplementationError("Import is still executing. Reconcile before sharing.");
    const scope = parseScope(order.scope);
    const departments = (await loadCustomerOperableDepartments(tx,row.facilityId)).filter(d => scope.departmentKeys.includes(d.key));
    const ids = new Set(departments.map(d => d.id));
    const plan = batch.reviewedPlan as unknown as { rows: PlanRow[]; scopeDepartmentId: string | null };
    for (const item of plan.rows) {
      if (!item.operation) continue;
      const op = item.operation;
      let departmentId = op.departmentId ?? plan.scopeDepartmentId;
      if (!departmentId && op.employeeId) departmentId = (await tx.employee.findFirst({ where: { id: op.employeeId, facilityId: row.facilityId }, select: { primaryDepartmentId: true } }))?.primaryDepartmentId ?? null;
      if (!departmentId || !ids.has(departmentId)) throw new ImplementationError("Every shared operation must resolve to an installed, currently authorized Department in the approved scope (D09).");
    }
    if (!await tx.implementationImportLink.findUnique({ where: { batchId } })) {
      await tx.implementationImportLink.create({ data: { engagementId, batchId } });
      await appendEvent(tx,actor,engagementId,"IMPORT_SHARED",{ batchId, dataset: batch.dataset, originalActorKind: batch.actorKind, originalActorId: actor.session.uid });
      await tx.implementationEngagement.update({ where: { id: row.id }, data: { deliveryRevision: { increment: 1 } } });
    } else if (!await tx.implementationImportLink.findFirst({ where: { engagementId, batchId } })) throw new ImplementationError("This import already belongs to another engagement.");
  });
}
export async function sharedResults(db: Db, actor: Actor, engagementId: string) {
  const row = await db.implementationEngagement.findUniqueOrThrow({ where: { id: engagementId } });
  await authorize(db,actor,row.facilityId); await requireParticipant(db,actor,engagementId);
  const links = await db.implementationImportLink.findMany({ where: { engagementId }, orderBy: { batchId: "asc" }, include: { batch: { include: { results: { orderBy: [{ rowNumber: "asc" },{ phase: "asc" },{ attempt: "desc" }] } } } } });
  // Explicit read projection: no source rows, normalized intents, session snapshots or credentials.
  return links.map(({ batch }) => ({ outcomes: (batch.reviewedPlan as unknown as { rows: PlanRow[] }).rows.map(row => ({ row: row.row, status: batch.results.find(r => r.rowNumber === row.row && r.phase === "IMPORT")?.status ?? "unknown" })), batchId: batch.id, dataset: batch.dataset, fileName: batch.fileName, actorKind: batch.actorKind, actorId: batch.actorUserId ?? batch.actorStaffId, executing: !!batch.leaseExpiresAt && +batch.leaseExpiresAt > Date.now(), receipts: batch.results.map(r => ({ row: r.rowNumber, phase: r.phase, attempt: r.attempt, status: r.status, message: r.message, targetIds: r.targetIds, createdAt: r.createdAt.toISOString() })) }));
}
export async function reviewHandoff(db: Db, actor: Actor, engagementId: string) {
  const row = await db.implementationEngagement.findUniqueOrThrow({ where: { id: engagementId } });
  await authorize(db,actor,row.facilityId); await requireParticipant(db,actor,engagementId);
  const events = await db.implementationEvent.findMany({ where: { engagementId }, orderBy: [{ createdAt: "asc" },{ id: "asc" }] });
  const stages = STAGES.map(stage => ({ stage, evidence: events.filter(e => e.kind === "DELIVERY" && (e.data as { stage?: string }).stage === stage).sort((a,b) => Number((a.data as { deliveryRevision?: number }).deliveryRevision ?? 0)-Number((b.data as { deliveryRevision?: number }).deliveryRevision ?? 0)).at(-1)?.data ?? null }));
  const results = await sharedResults(db,actor,engagementId);
  const fingerprint = digest({ revision: row.revision, deliveryRevision: row.deliveryRevision, stages, results });
  const acceptance = events.find(e => e.kind === "CUSTOMER_ACCEPTED");
  return { stages, results, fingerprint, acceptanceCurrent: row.acceptedAt ? (acceptance?.data as { fingerprint?: string } | undefined)?.fingerprint === fingerprint : null, readyForAcceptance: stages.every(s => s.evidence) && results.every(r => !r.executing) };
}
export async function acceptHandoff(db: PrismaClient, actor: Actor, engagementId: string, fingerprint: string) {
  const session = customer(actor);
  return transaction(db,async tx => {
    const row = await lockEngagement(tx,actor,engagementId);
    const links = await tx.implementationImportLink.findMany({ where: { engagementId }, orderBy: { batchId: "asc" } });
    for (const link of links) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SetupImportBatch" WHERE "id"=${link.batchId} FOR UPDATE`);
    const review = await reviewHandoff(tx,actor,engagementId);
    if (review.fingerprint !== fingerprint || !review.readyForAcceptance) throw new ImplementationError("Delivery or import results changed, or a stage is missing. Review the current delivered/deferred handoff before accepting.");
    const order = await tx.implementationOrder.findFirst({ where: { engagementId, revision: row.revision, status: { in: ["PAID","WAIVED"] } } });
    if (!order) throw new ImplementationError("No approved paid or waived service order exists.");
    if (row.acceptedAt) return;
    await tx.implementationEngagement.update({ where: { id: row.id }, data: { acceptedRevision: row.deliveryRevision, acceptedByUserId: session.uid, acceptedAt: new Date() } });
    await appendEvent(tx,actor,engagementId,"CUSTOMER_ACCEPTED",{ fingerprint, orderId: order.id, deliveryRevision: row.deliveryRevision, reviewedSnapshot: json({ stages: review.stages, results: review.results }) });
  });
}
export async function getEngagement(db: PrismaClient, actor: Actor, engagementId: string) {
  const row = await db.implementationEngagement.findUniqueOrThrow({ where: { id: engagementId }, include: { orders: { orderBy: { revision: "desc" }, include: { attempts: { orderBy: { sequence: "desc" }, select: { id: true, sequence: true, status: true, createdAt: true, updatedAt: true } } } }, events: { orderBy: { createdAt: "asc" } }, responsibleStaff: { select: { id: true, displayName: true } }, participants: { select: { userId: true, staffId: true } } } });
  await authorize(db,actor,row.facilityId); await requireParticipant(db,actor,engagementId);
  const sourceIds = row.events.filter(e => e.kind === "SOURCE_RECEIVED").map(e => (e.data as { messageId: string }).messageId);
  const attachments = await db.supportTicketAttachment.findMany({ where: { messageId: { in: sourceIds }, message: { ticketId: row.supportTicketId, ticket: { facilityId: row.facilityId } } }, select: { id: true, messageId: true, filename: true, scanStatus: true, rejectionReason: true, sizeBytes: true, scanResultCode: true, scannerEngineVersion: true, scannerSignatureVersion: true, scannedAt: true } });
  return { ...row, attachments, review: await reviewHandoff(db,actor,engagementId) };
}

/** Narrow private-source read path, independent of general support access and import ownership. */
export async function readImplementationSource(db: PrismaClient, actor: Actor, engagementId: string, attachmentId: string, store?: SupportAttachmentStore | null) {
  staff(actor);
  const row = await db.implementationEngagement.findUniqueOrThrow({ where: { id: engagementId } });
  await authorize(db,actor,row.facilityId); await requireParticipant(db,actor,engagementId);
  const attachment = await db.supportTicketAttachment.findUniqueOrThrow({ where: { id: attachmentId }, include: { message: { select: { ticketId: true, ticket: { select: { facilityId: true } } } } } });
  const source = await db.implementationEvent.findFirst({ where: { engagementId, kind: "SOURCE_RECEIVED", data: { path: ["messageId"], equals: attachment.messageId } } });
  if (!source || (source.data as { checksum?: string }).checksum !== attachment.checksumSha256 || attachment.message.ticketId !== row.supportTicketId || attachment.message.ticket.facilityId !== row.facilityId || attachment.scanStatus !== "CLEAN" || !attachment.storageKey) throw new ImplementationError("Source is unavailable or quarantined.");
  const { getSupportAttachmentStore } = await import("@/lib/support/attachment-store");
  const selectedStore = store === undefined ? getSupportAttachmentStore() : store;
  const { readVerifiedSupportAttachment } = await import("@/lib/support/scan-pending-attachments");
  const bytes = await readVerifiedSupportAttachment(selectedStore,attachment);
  if (!bytes) throw new ImplementationError("Private source file is unavailable.");
  await authorize(db,actor,row.facilityId); await requireParticipant(db,actor,engagementId);
  return { bytes, filename: attachment.filename, contentType: attachment.contentType };
}

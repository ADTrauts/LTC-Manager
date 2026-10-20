import { importTransaction } from "./transaction";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type SetupImportBatch } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { mayAuthenticateWithQuickPin } from "@/lib/credential-policy";
import { trackEvent } from "@/lib/telemetry";
import { liveActor, lockAuthority, lockDependencies, lockFacility, requireImportSession } from "./authority";
import { loadCatalog } from "./catalog";
import { executeRow } from "./execute";
import { planImport } from "./planner";
import { hash, ImportError, IMPORT_VERSION, MODE, newReview, parseSource, readReview, signReview, type Dataset, type ImportSource, type PlanRow, type Preview, type Results, type Review, type RowResult } from "./contract";

type StoredPlan = { source: ImportSource; rows: PlanRow[]; scopeDepartmentId: string | null };
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function assertReview(review: Review, actor: Awaited<ReturnType<typeof liveActor>>) {
  if (review.facilityId !== actor.facilityId || review.actorDigest !== hash(actor)) throw new ImportError("Actor, credential or Facility context changed. Reconcile, then preview again.");
  if (review.expiresAt <= Date.now()) throw new ImportError("Review expired. Reconcile committed results, then preview a fresh file for remaining work.");
}
function owns(batch: SetupImportBatch, session: FacilitySession) {
  if (batch.facilityId !== session.facilityId || batch.actorKind !== session.authKind || (batch.actorKind === "user" ? batch.actorUserId : batch.actorStaffId) !== session.uid) throw new ImportError("Import batch is not available in this actor/Facility context.");
}
async function batchLock(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SetupImportBatch" WHERE "id"=${id} FOR UPDATE`);
}
export async function previewImport(db: PrismaClient, session: FacilitySession, input: { dataset: Dataset; text: string; fileName: string; expectedFacilityId: string; scopeDepartmentId?: string | null }): Promise<Preview> {
  const actor = await liveActor(db,session,input.expectedFacilityId,input.dataset);
  const source = parseSource(input.dataset,input.text,input.fileName);
  const scopeDepartmentId = input.scopeDepartmentId || null;
  const rows = planImport(source,await loadCatalog(db,session,source),scopeDepartmentId,new Date());
  const review = newReview({ facilityId: session.facilityId, dataset: source.dataset, fileName: source.fileName, sourceHash: source.sourceHash, scopeDepartmentId, actorDigest: hash(actor), planDigest: hash({ source,rows,scopeDepartmentId }) });
  // Preview is read-only, including no durable batch/receipt, invitation or audit writes.
  return { batchId: review.batchId, reviewToken: signReview(review), expiresAt: new Date(review.expiresAt).toISOString(), dataset: source.dataset, fileName: source.fileName, sourceHash: source.sourceHash, rows };
}
async function append(tx: Prisma.TransactionClient, batchId: string, row: PlanRow, status: string, message: string, targetIds: Record<string,string>, digest: string, phase = "IMPORT") {
  const previous = await tx.setupImportResult.findFirst({ where: { batchId, rowNumber: row.row, phase }, orderBy: { attempt: "desc" } });
  return tx.setupImportResult.create({ data: { batchId, rowNumber: row.row, phase, attempt: (previous?.attempt ?? 0)+1, status, intendedKey: row.operation?.targetKey ?? row.ref, targetIds, message, confirmedDigest: digest } });
}
export async function getImportResults(db: PrismaClient, session: FacilitySession, batchId: string): Promise<Results> {
  const batch = await db.setupImportBatch.findUnique({ where: { id: batchId }, include: { results: { orderBy: { attempt: "desc" } } } });
  if (!batch) throw new ImportError("No confirmed import receipt exists yet. Do not assume a timed-out request succeeded; reconcile again or submit the same review.");
  owns(batch,session); await liveActor(db,session,session.facilityId,batch.dataset as Dataset);
  const stored = batch.reviewedPlan as unknown as StoredPlan;
  const convert = (r: typeof batch.results[number] | undefined): RowResult | null => r ? { row: r.rowNumber, phase: r.phase, attempt: r.attempt, status: r.status, message: r.message, targetIds: r.targetIds as Record<string,string>, createdAt: r.createdAt.toISOString() } : null;
  const rows: Results["rows"] = [];
  for (const row of stored.rows) {
    const result = convert(batch.results.find(r => r.rowNumber === row.row && r.phase === "IMPORT"));
    const delivery = convert(batch.results.find(r => r.rowNumber === row.row && r.phase === "ACTIVATION"));
    let enrollment: Results["rows"][number]["enrollment"];
    if (result?.targetIds.employeeId) {
      const employee = await db.employee.findFirst({ where: { id: result.targetIds.employeeId, facilityId: session.facilityId }, select: { roleType: true, pinDigest: true, status: true, user: { select: { isActive: true, passwordHash: true, emailVerifiedAt: true } } } });
      if (employee) enrollment = { account: !employee.user?.isActive || employee.status === "TERMINATED" ? "lifecycle_review" : employee.user.passwordHash ? employee.user.emailVerifiedAt ? "active" : "verification_pending" : "activation_pending", pin: mayAuthenticateWithQuickPin(employee.roleType) ? employee.pinDigest ? "set" : "pending — customer GM/FA uses People to set PIN" : "not_applicable" };
    }
    rows.push({ row: row.row, ref: row.ref, label: row.label, requiresAccountConfirmation: row.requiresAccountConfirmation, result, delivery, enrollment });
  }
  return { batchId, dataset: batch.dataset as Dataset, fileName: batch.fileName, expiresAt: batch.expiresAt.toISOString(), running: Boolean(batch.leaseToken && batch.leaseExpiresAt && +batch.leaseExpiresAt > Date.now()), rows };
}
export type ConfirmInput = { reviewToken: string; expectedFacilityId: string; text?: string; fileName?: string; confirmedAccountRows: number[]; rowNumbers?: number[] };
/** At most 25 rows per request. Domain write + immutable outcome are one transaction.
 * The bounded renewable lease makes interrupted requests reconcilable before retry. */
/** Server-internal orchestration hooks. Never accepted from form/client input.
 * Workbook checks and receipt mappings share the existing canonical row transaction. */
export type ExecutionContext = {
  /** Coordination-only claim validation. Domain execution always runs before. */
  beforeClaim?: (tx: Prisma.TransactionClient) => Promise<void>;
  before: (tx: Prisma.TransactionClient) => Promise<void>;
  after: (tx: Prisma.TransactionClient, row: PlanRow, outcome: { status: string; message: string; targetIds: Record<string,string> }) => Promise<void>;
};
export async function confirmImport(db: PrismaClient, session: FacilitySession, input: ConfirmInput, context?: ExecutionContext): Promise<Results> {
  const review = readReview(input.reviewToken);
  requireImportSession(session,input.expectedFacilityId,review.dataset);
  const suppliedSource = input.text === undefined ? null : parseSource(review.dataset,input.text,input.fileName || "");
  if (suppliedSource && (suppliedSource.sourceHash !== review.sourceHash || suppliedSource.fileName !== review.fileName)) throw new ImportError("Source file changed. Preview again.");
  const lease = randomUUID();
  const claimed = await importTransaction(db,async tx => {
    const actor = await lockAuthority(tx,session,review.dataset); assertReview(review,actor);
    await lockFacility(tx,session.facilityId); await batchLock(tx,review.batchId);
    if (context) await (context.beforeClaim ?? context.before)(tx);
    let batch = await tx.setupImportBatch.findUnique({ where: { id: review.batchId } });
    if (!batch) {
      if (!suppliedSource) throw new ImportError("The first confirmation requires the same CSV file that was previewed.");
      const source = suppliedSource;
      await lockDependencies(tx,session.facilityId,source.rows);
      const rows = planImport(source,await loadCatalog(tx,session,source),review.scopeDepartmentId,new Date());
      if (hash({ source,rows,scopeDepartmentId: review.scopeDepartmentId }) !== review.planDigest) throw new ImportError("Material facts changed since preview. No batch was executed. Preview again.");
      assertReview(review,await liveActor(tx,session,session.facilityId,review.dataset));
      batch = await tx.setupImportBatch.create({ data: { id: review.batchId, facilityId: session.facilityId, actorKind: session.authKind!, actorUserId: session.authKind === "user" ? session.uid : null, actorStaffId: session.authKind === "harbor_staff" ? session.uid : null, actorSnapshot: asJson(actor), dataset: review.dataset, mode: MODE[review.dataset], contractVersion: IMPORT_VERSION, sourceHash: review.sourceHash, fileName: review.fileName, planDigest: review.planDigest, reviewedPlan: asJson({ source,rows,scopeDepartmentId: review.scopeDepartmentId }), expiresAt: new Date(review.expiresAt) } });
    }
    owns(batch,session);
    if (batch.planDigest !== review.planDigest || batch.sourceHash !== review.sourceHash || batch.contractVersion !== IMPORT_VERSION) throw new ImportError("Review does not match this durable batch.");
    if (batch.leaseToken && batch.leaseExpiresAt && +batch.leaseExpiresAt > Date.now()) return false;
    await tx.setupImportBatch.update({ where: { id: batch.id }, data: { leaseToken: lease, leaseExpiresAt: new Date(Date.now()+60_000) } });
    return true;
  },{ timeout: 30_000, maxWait: 30_000 });
  if (!claimed) return { ...await getImportResults(db,session,review.batchId), message: "Another request is still executing. Reconcile again before retrying." };
  const batch = await db.setupImportBatch.findUniqueOrThrow({ where: { id: review.batchId } });
  const stored = batch.reviewedPlan as unknown as StoredPlan;
  const previous = await db.setupImportResult.findMany({ where: { batchId: batch.id, phase: "IMPORT" }, select: { rowNumber: true, status: true, attempt: true }, orderBy: { attempt: "desc" } });
  const latest = new Map<number,string>();
  for (const receipt of previous) if (!latest.has(receipt.rowNumber)) latest.set(receipt.rowNumber,receipt.status);
  const requested = input.rowNumbers ? new Set(input.rowNumbers) : null;
  const eligible = stored.rows.filter(r => !["committed","reused"].includes(latest.get(r.row) || "") && (!requested || requested.has(r.row)));
  // Advance unattempted rows before retries. Permanently blocked preview rows get
  // one durable outcome, rather than starving later valid rows on every request.
  const queue = [...eligible.filter(r => !latest.has(r.row)), ...eligible.filter(r => latest.has(r.row) && r.operation && r.action !== "blocked")].slice(0,25);
  let unknown = false;
  try {
    for (const row of queue) {
      try {
        await importTransaction(db,async tx => {
          const actor = await lockAuthority(tx,session,review.dataset); assertReview(review,actor);
          await lockFacility(tx,session.facilityId); await batchLock(tx,batch.id);
          const currentBatch = await tx.setupImportBatch.findUniqueOrThrow({ where: { id: batch.id } });
          if (currentBatch.leaseToken !== lease || !currentBatch.leaseExpiresAt || +currentBatch.leaseExpiresAt <= Date.now()) throw new ImportError("Execution lease changed. Reconcile before continuing.");
          const prior = await tx.setupImportResult.findFirst({ where: { batchId: batch.id, rowNumber: row.row, phase: "IMPORT", status: { in: ["committed","reused"] } } });
          if (prior) return;
          if (!row.operation || row.action === "blocked") throw new ImportError(row.message);
          if (row.requiresAccountConfirmation && !input.confirmedAccountRows.includes(row.row)) throw new ImportError("Explicit confirmation of this existing account match is required.");
          const sourceRow = stored.source.rows.find(r => r.row === row.row)!;
          await lockDependencies(tx,session.facilityId,[sourceRow]);
          const source = { ...stored.source, rows: [sourceRow] };
          const current = planImport(source,await loadCatalog(tx,session,source),stored.scopeDepartmentId,new Date())[0]!;
          if (current.action === "blocked" || current.beforeHash !== row.beforeHash || hash(current.operation) !== hash(row.operation)) throw new ImportError("Material employee/location/Department/dependency facts changed. Reconcile and preview again.");
          if (context) await context.before(tx);
          const outcome = await executeRow(tx,session,current);
          if (context) await context.after(tx,current,outcome);
          // Recheck time-effective authority/review expiry after all dependency and domain waits.
          assertReview(review,await liveActor(tx,session,session.facilityId,review.dataset));
          await append(tx,batch.id,row,outcome.status,outcome.message,outcome.targetIds,hash({ plan: review.planDigest, confirmedAccount: row.requiresAccountConfirmation ? row.row : null }));
          await tx.setupImportBatch.update({ where: { id: batch.id }, data: { leaseExpiresAt: new Date(Date.now()+60_000) } });
        },{ timeout: 25_000, maxWait: 30_000, diagnostics: { batchId: batch.id, row: row.row, stage: "row_execution" } });
      } catch (error) {
        const failure = error as { code?: unknown; meta?: { code?: unknown } } | null;
        await trackEvent("onboarding.import.row_error", { batchId: batch.id, row: row.row,
          code: typeof failure?.code === "string" ? failure.code : "DOMAIN_OR_UNKNOWN",
          sqlState: typeof failure?.meta?.code === "string" ? failure.meta.code : null });
        try {
          // Waiting on the batch lock reconciles an ambiguous COMMIT response first.
          // Absence of its atomic receipt proves there was no committed row mutation.
          await db.$transaction(async tx => {
            await batchLock(tx,batch.id);
            const successRow = await tx.setupImportResult.findFirst({ where: { batchId: batch.id, rowNumber: row.row, phase: "IMPORT", status: { in: ["committed","reused"] } } });
            if (successRow) return;
            await append(tx,batch.id,row,error instanceof ImportError ? "blocked" : "failed",error instanceof ImportError ? error.message : "Row failed and no committed receipt exists. Reconcile before retry; a fresh preview may be required.",{},review.planDigest);
          },{ timeout: 30_000, maxWait: 30_000 });
        } catch { unknown = true; break; }
      }
    }
  } finally {
    try { await db.setupImportBatch.updateMany({ where: { id: batch.id, leaseToken: lease }, data: { leaseToken: null, leaseExpiresAt: null } }); }
    catch { unknown = true; }
  }
  await trackEvent("onboarding.import.request_finished",{ facilityId: session.facilityId, batchId: batch.id, dataset: review.dataset, actorKind: session.authKind, requestedRows: queue.length, unknown });
  const results = await getImportResults(db,session,batch.id);
  return { ...results, message: unknown ? "Some outcomes are unknown. Reconcile receipts before retrying; no file-wide rollback is claimed." : "Read the per-row receipts. Earlier committed rows remain committed; reconcile before continuing or retrying remaining rows." };
}

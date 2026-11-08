import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import type { FacilitySession } from "@/lib/auth";
import { requireBulkImportAuthority } from "@/lib/bulk-import/authority";
import { requiresEmailPasswordAccount } from "@/lib/credential-policy";
import { resolveCurrentInternalFacilityRole } from "@/lib/facility-access/internal-facility-role";
import { diffProfileForAudit, snapshotFromEmployeeRow } from "@/lib/hr-audit";
import { validateSessionAuthority } from "@/lib/session-revocation/session-version";
import {
  EmployeeCsvInputError, EMPLOYEE_CSV_MAX_BYTES, EMPLOYEE_UPDATE_CONTRACT, EMPLOYEE_UPDATE_TEMPLATE_VERSION,
  parseEmployeeUpdateCsv, type EmployeeCsvField, type EmployeeUpdateRow,
} from "@/lib/employee-csv-import";
import type { EmployeeCsvPreview, EmployeeCsvPreviewRow, EmployeeCsvResult, EmployeeCsvRowResult } from "./types";

type Db = PrismaClient | Prisma.TransactionClient;
type Source = { text: string; fileName: string; contractVersion?: string };
const employeeInclude = {
  workStations: true, employeeDepartments: true, teamMemberships: true, departmentJobRoles: true,
  unitAccesses: true, primaryUnit: { select: { id: true, name: true, facilityId: true, isActive: true } },
} satisfies Prisma.EmployeeInclude;
type Employee = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;
const REVIEW_TTL_MS = 30 * 60 * 1000;
class BlockedRow extends EmployeeCsvInputError {}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value !== null && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]),
  );
  return value;
}
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
function display(value: unknown): string | null {
  if (value == null) return null;
  // CSV date fields express calendar days. Resubmitting a day must preserve its stored time.
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return [...value].sort().join("|");
  return String(value);
}
function employeeDigest(employee: Employee, credentialRole: string | null): string {
  // @updatedAt alone cannot detect direct membership writes; fingerprint their actual facts too.
  const facts = { ...employee, updatedAt: undefined };
  return digest({ facts: { ...facts, workStations: employee.workStations.map((item) => item.station) }, credentialRole });
}

export function requireEmployeeCsvAuthority(session: FacilitySession): void {
  if (session.authKind !== "user" || session.authMethod !== "PASSWORD" || session.scopeKind !== "facility" ||
      !session.uid || !session.facilityId || ("accessKind" in session && session.accessKind === "partner") || !Number.isInteger(session.sessionVersion)) {
    throw new EmployeeCsvInputError("Employee CSV updates require an internal Facility User signed in with a password. Console and Quick PIN imports are not supported.");
  }
  try { requireBulkImportAuthority(session, "MANAGER"); }
  catch { throw new EmployeeCsvInputError("Insufficient permissions. Employee CSV updates require a Manager or higher."); }
}
async function requireLiveAuthority(db: Db, session: FacilitySession) {
  requireEmployeeCsvAuthority(session);
  if (!(await validateSessionAuthority(session, db)).valid) throw new BlockedRow("Your Facility access or session changed. Sign in again and preview the file.");
}
function parseSource(source: Source) {
  if (source.contractVersion && source.contractVersion !== EMPLOYEE_UPDATE_CONTRACT) throw new EmployeeCsvInputError("Unsupported import version. Download the current employee update template.");
  if (Buffer.byteLength(source.fileName, "utf8") > 512) throw new EmployeeCsvInputError("Filename is too long. Rename the CSV and preview again.");
  if (Buffer.byteLength(source.text, "utf8") > EMPLOYEE_CSV_MAX_BYTES) throw new EmployeeCsvInputError("File too large (max 2 MB).");
  return { rows: parseEmployeeUpdateCsv(source.text), sourceHash: createHash("sha256").update(source.text, "utf8").digest("hex") };
}

function blocked(row: EmployeeUpdateRow, message: string): EmployeeCsvPreviewRow {
  return { row: row.row, employeeId: null, employee: "Unresolved", match: "None", status: "blocked", changes: [], message };
}

type Planned = { view: EmployeeCsvPreviewRow; employee?: Employee; after?: Employee; beforeHash: string; afterHash: string; patch: Prisma.EmployeeUncheckedUpdateInput; stations?: Employee["workStations"][number]["station"][] };
async function planRow(db: Db, facilityId: string, row: EmployeeUpdateRow): Promise<Planned> {
  const deny = (message: string): Planned => ({ view: blocked(row, message), beforeHash: "", afterHash: "", patch: {} });
  if (row.errors.length) return deny(row.errors.join(" "));
  const values = row.values;
  const match = values.employeeId ? "Employee ID" : typeof values.email === "string" ? "Unique email" : "Unique first + last name";
  let where: Prisma.EmployeeWhereInput;
  if (values.employeeId) where = { facilityId, id: values.employeeId };
  else if (typeof values.email === "string") where = { facilityId, email: { equals: values.email, mode: "insensitive" } };
  else if (values.firstName && values.lastName && values.email === undefined) where = {
    facilityId, firstName: { equals: values.firstName, mode: "insensitive" }, lastName: { equals: values.lastName, mode: "insensitive" },
  };
  else return deny("Supply an Employee ID, unique email, or both names. Clearing email requires an Employee ID.");
  const matches = await db.employee.findMany({ where, include: employeeInclude, take: 2 });
  if (matches.length !== 1) return deny(matches.length ? "Ambiguous employee match. Use a verified Employee ID." : "No existing employee matches in this Facility. Add new employees from Add employee; CSV cannot create employees.");
  const employee = matches[0]!;
  const view: EmployeeCsvPreviewRow = { row: row.row, employeeId: employee.id, employee: `${employee.firstName} ${employee.lastName}`, match, status: "ready", changes: [], message: "" };
  const denied = (message: string): Planned => ({ view: { ...view, status: "blocked", message }, beforeHash: "", afterHash: "", patch: {} });
  if (values.employeeId && typeof values.email === "string") {
    const collisions = await db.employee.findMany({ where: { facilityId, email: { equals: values.email, mode: "insensitive" }, id: { not: employee.id } }, select: { id: true }, take: 1 });
    if (collisions.length) return denied("Employee ID and email identify different employees. Correct the file and preview again.");
  }
  const immutable = ["roleType", "status", "terminationDate", "chrcOffboardingCompletedAt", "chrcOffboardingNotes"] as const;
  for (const field of immutable) {
    if (values[field] !== undefined && display(values[field]) !== display(employee[field])) return denied(`${field} changes require the existing employee profile/status/separation action. Ordinary CSV updates cannot change authority or employment lifecycle.`);
  }
  let credentialRole: string | null = null;
  if (values.email === null) {
    const effective = employee.userId ? await resolveCurrentInternalFacilityRole(db, { userId: employee.userId, facilityId }) : null;
    credentialRole = effective?.roleKey ?? null;
    if (requiresEmailPasswordAccount(employee.roleType) || (effective && requiresEmailPasswordAccount(effective.roleKey)))
      return denied("Email cannot be cleared for a role requiring an email-backed account. Use the employee profile action.");
  }
  const after: Employee = { ...employee };
  const patch: Prisma.EmployeeUncheckedUpdateInput = {};
  let stations: Planned["stations"];
  for (const field of Object.keys(values) as EmployeeCsvField[]) {
    if (field === "employeeId" || (immutable as readonly string[]).includes(field)) continue;
    let beforeValue: unknown, afterValue: unknown;
    const next = values[field];
    if (field === "workStations") {
      beforeValue = employee.workStations.map((item) => item.station).sort(); afterValue = next;
      if (display(beforeValue) !== display(next)) {
        stations = values.workStations!;
        // Membership creation timestamps are not semantic facts in the review fingerprint.
        after.workStations = stations.map((station) => ({ employeeId: employee.id, station, createdAt: new Date(0) }));
      }
    } else if (field === "primaryUnit") {
      const units = next === null ? [] : await db.unit.findMany({ where: { facilityId, name: { equals: String(next), mode: "insensitive" }, isActive: true }, select: { id: true, name: true, facilityId: true, isActive: true }, take: 2 });
      if (next !== null && units.length !== 1) return denied("primaryUnit must identify exactly one active location in this Facility.");
      const unit = units[0] ?? null;
      if (unit && employee.unitAccesses.length && !employee.unitAccesses.some((item) => item.unitId === unit.id)) return denied("Primary location must be one of the employee's allowed locations.");
      beforeValue = employee.primaryUnit?.name ?? null; afterValue = unit?.name ?? null;
      if (employee.primaryUnitId !== (unit?.id ?? null)) { patch.primaryUnitId = unit?.id ?? null; after.primaryUnitId = unit?.id ?? null; after.primaryUnit = unit; }
    } else {
      const key = field as Exclude<EmployeeCsvField, "employeeId" | "workStations" | "primaryUnit">;
      beforeValue = employee[key]; afterValue = next;
      if (display(beforeValue) !== display(next)) { Object.assign(patch, { [key]: next }); Object.assign(after, { [key]: next }); }
    }
    if (display(beforeValue) !== display(afterValue)) view.changes.push({
      field, ...row.columns[field]!, before: display(beforeValue), after: display(afterValue), clear: next === null || (Array.isArray(next) && next.length === 0),
    });
  }
  if (values.birthMonth !== undefined || values.birthDay !== undefined) {
    const { birthMonth: month, birthDay: day } = after;
    if ((month === null) !== (day === null) || (month !== null && day !== null && new Date(Date.UTC(2000, month - 1, day)).getUTCMonth() !== month - 1))
      return denied("Birth month and day must form a real date, or both be deliberately cleared.");
  }
  if (after.status === "TERMINATED" && values.onLeave === true) return denied("A terminated employee cannot be placed on leave by an ordinary update.");
  view.status = view.changes.length ? "ready" : "unchanged";
  view.message = view.changes.length ? `${view.changes.length} field change(s) to review.` : "No changes to commit.";
  return { view, employee, after, patch, stations, beforeHash: employeeDigest(employee, credentialRole), afterHash: employeeDigest(after, credentialRole) };
}

const reviewRowSchema = z.object({ row: z.number().int(), id: z.string().nullable(), status: z.enum(["ready", "unchanged", "blocked"]), beforeHash: z.string(), afterHash: z.string(), planHash: z.string() }).strict();
const reviewSchema = z.object({ version: z.literal(EMPLOYEE_UPDATE_TEMPLATE_VERSION), facilityId: z.string(), actorId: z.string(), sessionVersion: z.number(), role: z.string(), sourceHash: z.string(), fileName: z.string(), expires: z.number(), rows: z.array(reviewRowSchema).max(500) }).strict();
type Review = z.infer<typeof reviewSchema>;
function secretKey(secret: string) { if (!secret.trim()) throw new EmployeeCsvInputError("Employee import review is temporarily unavailable. Contact your administrator."); return secret; }
function signReview(review: Review, secret: string) {
  const body = Buffer.from(JSON.stringify(review)).toString("base64url");
  return `${body}.${createHmac("sha256", secretKey(secret)).update(`employee-update-review:${body}`).digest("base64url")}`;
}
function readReview(token: string, secret: string): Review {
  if (token.length > 300_000) throw new EmployeeCsvInputError("Invalid review. Preview the file again.");
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) throw new EmployeeCsvInputError("A valid preview is required before confirmation.");
  const expected = createHmac("sha256", secretKey(secret)).update(`employee-update-review:${body}`).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new EmployeeCsvInputError("Review was changed. Preview the file again.");
  const parsed = reviewSchema.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  if (!parsed.success) throw new EmployeeCsvInputError("Unsupported review. Preview the file again.");
  return parsed.data;
}

export async function previewEmployeeCsv(db: Db, session: FacilitySession, source: Source, secret: string, now = new Date()): Promise<EmployeeCsvPreview> {
  await requireLiveAuthority(db, session);
  const { rows, sourceHash } = parseSource(source);
  secretKey(secret);
  const plans: Planned[] = [];
  for (const row of rows) plans.push(await planRow(db, session.facilityId, row));
  const counts = new Map<string, number>();
  const emailCounts = new Map<string, number>();
  for (const plan of plans) if (plan.view.employeeId) counts.set(plan.view.employeeId, (counts.get(plan.view.employeeId) ?? 0) + 1);
  for (const row of rows) if (typeof row.values.email === "string") emailCounts.set(row.values.email, (emailCounts.get(row.values.email) ?? 0) + 1);
  plans.forEach((plan, index) => {
    if (plan.view.employeeId && counts.get(plan.view.employeeId)! > 1)
      plan.view = { ...plan.view, status: "blocked", message: "Multiple file rows target this employee. Combine the intended changes into one row." };
    else if (typeof rows[index]!.values.email === "string" && emailCounts.get(rows[index]!.values.email!)! > 1)
      plan.view = { ...plan.view, status: "blocked", message: "Multiple file rows propose the same email. Resolve the conflict and preview again." };
  });
  const expires = now.getTime() + REVIEW_TTL_MS;
  const review: Review = {
    version: EMPLOYEE_UPDATE_TEMPLATE_VERSION, facilityId: session.facilityId, actorId: session.uid,
    sessionVersion: session.sessionVersion!, role: session.role, sourceHash, fileName: source.fileName, expires,
    rows: plans.map((plan) => ({ row: plan.view.row, id: plan.view.employeeId, status: plan.view.status, beforeHash: plan.beforeHash, afterHash: plan.afterHash, planHash: digest(plan.view) })),
  };
  return { rows: plans.map((plan) => plan.view), reviewToken: signReview(review, secret), expiresAt: new Date(expires).toISOString(), sourceHash, fileName: source.fileName, contractVersion: EMPLOYEE_UPDATE_CONTRACT, templateVersion: EMPLOYEE_UPDATE_TEMPLATE_VERSION };
}

async function lockAuthority(tx: Prisma.TransactionClient, session: FacilitySession) {
  // Hold the actual authority rows, not advisory locks that other writers don't use.
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${session.uid} FOR SHARE`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "UserFacilityAccess" WHERE "userId" = ${session.uid} AND "facilityId" = ${session.facilityId} FOR SHARE`);
  await tx.$queryRaw(Prisma.sql`SELECT p."id" FROM "UserFacilityRolePeriod" p JOIN "UserFacilityAccess" a ON a."id" = p."userFacilityAccessId" WHERE a."userId" = ${session.uid} AND a."facilityId" = ${session.facilityId} FOR SHARE OF p`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Role" WHERE "key" = ${session.role}::"RoleKey" FOR SHARE`);
  await requireLiveAuthority(tx, session);
}

export async function confirmEmployeeCsv(db: PrismaClient, session: FacilitySession, source: Source, token: string, secret: string, now = new Date()): Promise<EmployeeCsvResult> {
  requireEmployeeCsvAuthority(session);
  const { rows, sourceHash } = parseSource(source);
  const review = readReview(token, secret);
  if (review.expires <= now.getTime() || review.facilityId !== session.facilityId || review.actorId !== session.uid ||
      review.role !== session.role || review.sessionVersion !== session.sessionVersion || review.sourceHash !== sourceHash || review.fileName !== source.fileName)
    throw new EmployeeCsvInputError("Review expired or the file, Facility, actor, or session changed. Preview again.");
  if (rows.length !== review.rows.length) throw new EmployeeCsvInputError("Review does not match the file. Preview again.");
  const results: EmployeeCsvRowResult[] = [];
  for (const row of rows) {
    const expected = review.rows.find((item) => item.row === row.row);
    if (!expected) throw new EmployeeCsvInputError("Review does not match the file. Preview again.");
    if (expected.status === "blocked") { results.push({ row: row.row, employeeId: expected.id, status: "blocked", message: "Blocked during preview. Correct the row and preview again." }); continue; }
    try {
      const result = await db.$transaction(async (tx): Promise<EmployeeCsvRowResult> => {
        if (Date.now() >= review.expires) throw new BlockedRow("Review expired. Preview again.");
        await lockAuthority(tx, session);
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Employee" WHERE "id" = ${expected.id} AND "facilityId" = ${session.facilityId} FOR UPDATE`);
        const planned = await planRow(tx, session.facilityId, row);
        if (Date.now() >= review.expires) throw new BlockedRow("Review expired while waiting. Preview again.");
        // Locks prevent edits to authority rows; time-effective periods can still expire while waiting.
        await requireLiveAuthority(tx, session);
        if (planned.view.employeeId !== expected.id || planned.view.status === "blocked") throw new BlockedRow("Employee match or dependencies changed. Preview again.");
        if (planned.beforeHash === expected.afterHash && planned.view.status === "unchanged")
          return { row: row.row, employeeId: expected.id, status: "unchanged", message: "Already matches the reviewed result; nothing committed." };
        if (planned.beforeHash !== expected.beforeHash || digest(planned.view) !== expected.planHash) throw new BlockedRow("Employee or dependencies changed since preview. Preview again.");
        if (!planned.view.changes.length) return { row: row.row, employeeId: expected.id, status: "unchanged", message: "No changes to commit." };
        const before = planned.employee!, after = planned.after!;
        // Only supplied ordinary fields enter this patch. No identity/access/lifecycle writes.
        await tx.employee.update({ where: { id: before.id, facilityId: session.facilityId }, data: planned.patch });
        if (planned.stations !== undefined) {
          await tx.employeeWorkStation.deleteMany({ where: { employeeId: before.id } });
          if (planned.stations.length) await tx.employeeWorkStation.createMany({ data: planned.stations.map((station) => ({ employeeId: before.id, station })) });
        }
        const changes = diffProfileForAudit(snapshotFromEmployeeRow(before), snapshotFromEmployeeRow(after));
        if (before.primaryUnitId !== after.primaryUnitId) changes.push({ fieldKey: "profile.primaryUnitId", oldValue: before.primaryUnitId, newValue: after.primaryUnitId });
        const committedAt = new Date().toISOString();
        await tx.employeeHrAuditLog.createMany({ data: [
          ...changes.map((change) => ({ ...change, facilityId: session.facilityId, employeeId: before.id, userId: session.uid })),
          { facilityId: session.facilityId, employeeId: before.id, userId: session.uid, fieldKey: "import.employeeCsv.receipt", oldValue: null,
            newValue: JSON.stringify({ contractVersion: EMPLOYEE_UPDATE_CONTRACT, version: review.version, dataset: "People", mode: "update_existing",
              fileName: source.fileName, sourceHash, row: row.row, actorKind: "user", planHash: expected.planHash,
              columns: planned.view.changes.map(({ field, column, header }) => ({ field, column, header })), committedAt }) },
        ] });
        return { row: row.row, employeeId: before.id, status: "committed", message: `${planned.view.changes.length} reviewed field change(s) committed.`, committedAt };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
      results.push(result); // Never report a commit until the transaction has committed.
    } catch (error) {
      results.push({ row: row.row, employeeId: expected.id, status: error instanceof BlockedRow ? "blocked" : "failed",
        message: error instanceof BlockedRow ? error.message : "Row transaction failed or conflicted; no changes committed for this row. Preview again before retrying." });
    }
  }
  return { rows: results, committed: results.filter((row) => row.status === "committed").length,
    unchanged: results.filter((row) => row.status === "unchanged").length, blocked: results.filter((row) => row.status === "blocked").length,
    failed: results.filter((row) => row.status === "failed").length, sourceHash };
}

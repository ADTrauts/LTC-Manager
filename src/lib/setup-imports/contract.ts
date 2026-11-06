import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { readRecords, normalizeHeaderKey } from "@/lib/employee-csv-import";

import { DATASETS, HEADERS, MODE, IMPORT_VERSION, type Dataset } from "./public-contract";
export { DATASETS, HEADERS, MODE, IMPORT_VERSION, type Dataset, safeCsvCell } from "./public-contract";
export class ImportError extends Error {}
export type SourceRow = { row: number; ref: string; values: Record<string, string>; errors: string[] };
export type ImportSource = { dataset: Dataset; fileName: string; sourceHash: string; version: string; mode: string; columns: Array<{ field: string; header: string; column: number }>; rows: SourceRow[] };
export type Operation = {
  kind: "locations" | "workforce" | "employee_departments" | "department_locations" | "assets";
  locationPlan?: import("@/lib/bulk-import/facility-structure").FacilityStructureImportPlan;
  targetKey: string; employeeId?: string; userId?: string; departmentId?: string; unitId?: string; spaceId?: string;
  firstName?: string; lastName?: string; email?: string; roleType?: string; employmentType?: string; phone?: string;
  membership?: string; teamId?: string; teamPrimary?: boolean; jobRoleId?: string; jobTitleId?: string;
  locationType?: string; locationId?: string; responsibilityKind?: string;
  asset?: { name: string; equipmentType: string; assetCode: string | null; serialNumber: string | null; facilityAssetNumber: string | null; manufacturer: string | null; model: string | null; description: string | null; notes: string | null; criticality: string; status: string };
};
export type PlanRow = { row: number; ref: string; label: string; action: "create" | "add" | "reuse" | "blocked"; message: string; requiresAccountConfirmation: string | null; beforeHash: string; operation: Operation | null };
export type Review = { batchId: string; facilityId: string; dataset: Dataset; scopeDepartmentId: string | null; version: string; sourceHash: string; fileName: string; planDigest: string; actorDigest: string; issuedAt: number; expiresAt: number };
export type Preview = { batchId: string; reviewToken: string; expiresAt: string; dataset: Dataset; fileName: string; sourceHash: string; rows: PlanRow[] };
export type RowResult = { row: number; phase: string; attempt: number; status: string; message: string; targetIds: Record<string, string>; createdAt: string };
export type Results = { batchId: string; dataset: Dataset; fileName: string; expiresAt: string; running: boolean; rows: Array<{ row: number; ref: string; label: string; result: RowResult | null; delivery: RowResult | null; enrollment?: { account: string; pin: string }; requiresAccountConfirmation: string | null }>; message?: string };
export type Outcome<T> = { ok: true; data: T } | { ok: false; error: string; batchId?: string };

export function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k,canonical(v)]));
  return value;
}
export function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
export function parseSource(dataset: Dataset, text: string, fileName: string): ImportSource {
  if (!( [...DATASETS, "locations"] as readonly string[]).includes(dataset)) throw new ImportError("Choose a supported CSV dataset.");
  if (Buffer.byteLength(text, "utf8") > 2_000_000 || fileName.length > 200) throw new ImportError("CSV exceeds 2 MB or its filename exceeds 200 characters.");
  let parsed: ReturnType<typeof readRecords>;
  try { parsed = readRecords(text); }
  catch (error) { throw new ImportError(error instanceof Error ? error.message : "Malformed CSV. Check quoting and row lengths."); }
  const [header, ...records] = parsed;
  if (!header || !records.length) throw new ImportError("Supply a header and at least one data row. Examples are not imported automatically.");
  if (records.length > (dataset === "workforce" ? 500 : 2000)) throw new ImportError("Too many rows: workforce permits 500; other datasets permit 2,000.");
  const names = new Map(HEADERS[dataset].flatMap(n => [[normalizeHeaderKey(n),n],[n.replace(/[A-Z]/g,c => `_${c.toLowerCase()}`),n]]));
  const fields = header.cells.map(h => names.get(normalizeHeaderKey(h)));
  if (fields.some(f => !f) || new Set(fields).size !== fields.length) throw new ImportError("Unknown, blank or duplicate header. Download this dataset's template. Credential and lifecycle columns are not supported by these additive imports.");
  const columns = fields.map((field,i) => ({ field: field!, header: header.cells[i]!, column: i+1 }));
  const rows = records.map(({ row, cells }) => {
    const errors: string[] = [];
    if (cells.length < fields.length || cells.slice(fields.length).some(Boolean)) errors.push("Row length differs from the header.");
    const values: Record<string,string> = {};
    columns.forEach(({field,column}) => {
      const v = cells[column-1]?.trim();
      if (!v) return;
      if (v.length > 2000) errors.push(`${field} exceeds 2,000 characters.`);
      if (/^[=]|^[+@-](?!\d)/.test(v)) errors.push(`${field}: formula prefixes are not supported.`);
      if (v === "__CLEAR__") errors.push("These imports add or reuse; use the existing update/lifecycle tools for explicit clears or removal.");
      values[field] = v;
    });
    return { row, ref: values.rowRef || `row:${row}`, values, errors };
  });
  const refs = new Map<string,number>(); rows.forEach(r => refs.set(r.ref,(refs.get(r.ref)||0)+1));
  rows.forEach(r => { if (refs.get(r.ref)! > 1) r.errors.push("Duplicate rowRef in this file."); });
  return { dataset, fileName, sourceHash: createHash("sha256").update(text,"utf8").digest("hex"), version: IMPORT_VERSION, mode: MODE[dataset], columns, rows };
}
function secret() { const key = process.env.AUTH_SECRET; if (!key) throw new ImportError("Import review signing is not configured."); return key; }
export function signReview(review: Review): string {
  const body = Buffer.from(JSON.stringify(review)).toString("base64url");
  return `${body}.${createHmac("sha256",secret()).update(`setup-import/1:${body}`).digest("base64url")}`;
}
export function readReview(token: string): Review {
  try {
    if (token.length > 6000) throw new Error();
    const [body,signature,extra] = token.split("."); if (!body || !signature || extra) throw new Error();
    const actual = Buffer.from(signature,"base64url"), expected = createHmac("sha256",secret()).update(`setup-import/1:${body}`).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) throw new Error();
    const value = JSON.parse(Buffer.from(body,"base64url").toString()) as Review;
    if (value.version !== IMPORT_VERSION || !([...DATASETS, "locations"] as readonly string[]).includes(value.dataset) || typeof value.expiresAt !== "number" || typeof value.batchId !== "string") throw new Error();
    return value;
  } catch { throw new ImportError("Invalid import review. Preview the CSV again."); }
}
export function newReview(input: Omit<Review,"batchId"|"issuedAt"|"expiresAt"|"version">): Review {
  return { ...input, version: IMPORT_VERSION, batchId: randomUUID(), issuedAt: Date.now(), expiresAt: Date.now()+30*60_000 };
}

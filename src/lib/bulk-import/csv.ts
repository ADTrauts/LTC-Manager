import { parseCsv } from "@/lib/csv-parse";

import { BULK_IMPORT_MAX_BYTES, BULK_IMPORT_MAX_ROWS } from "./types";

export function normalizeHeaderKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function mapHeadersWithAliases(
  headers: string[],
  aliases: Record<string, string>,
): Map<number, string> {
  const m = new Map<number, string>();
  headers.forEach((h, i) => {
    const key = aliases[normalizeHeaderKey(h)];
    if (key) m.set(i, key);
  });
  return m;
}

export function cellAt(
  cells: string[],
  colMap: Map<number, string>,
  field: string,
): string {
  for (const [idx, key] of colMap.entries()) {
    if (key === field) return (cells[idx] ?? "").trim();
  }
  return "";
}

export function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function rowsToCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map((c) => escapeCsvCell(c ?? "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export type ReadCsvTextResult =
  | { ok: true; headers: string[]; rows: string[][]; fileName: string | null }
  | { ok: false; error: string };

export function readCsvText(
  text: string,
  options?: { fileName?: string | null; maxBytes?: number; maxRows?: number },
): ReadCsvTextResult {
  const maxBytes = options?.maxBytes ?? BULK_IMPORT_MAX_BYTES;
  const maxRows = options?.maxRows ?? BULK_IMPORT_MAX_ROWS;
  if (text.length > maxBytes) {
    return {
      ok: false,
      error: `File is too large (max ${Math.floor(maxBytes / 1_000_000)} MB).`,
    };
  }
  const { headers, rows } = parseCsv(text);
  if (headers.length === 0) {
    return { ok: false, error: "CSV has no header row." };
  }
  if (rows.length === 0) {
    return { ok: false, error: "CSV has no data rows." };
  }
  if (rows.length > maxRows) {
    return {
      ok: false,
      error: `Too many rows (${rows.length}). Maximum is ${maxRows}.`,
    };
  }
  return {
    ok: true,
    headers,
    rows,
    fileName: options?.fileName ?? null,
  };
}

/** Build a downloadable validation-results CSV from row issues + key fields. */
export function buildValidationResultsCsv(input: {
  headers: string[];
  rows: Array<{
    rowNumber: number;
    status: string;
    message: string;
    cells: string[];
  }>;
}): string {
  const outHeaders = ["row", "status", "message", ...input.headers];
  const outRows = input.rows.map((r) => [
    String(r.rowNumber),
    r.status,
    r.message,
    ...input.headers.map((_, i) => r.cells[i] ?? ""),
  ]);
  return rowsToCsv(outHeaders, outRows);
}

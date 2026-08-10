/**
 * Shared bulk-import presentation types for BUILD onboarding imports.
 * Preview/validation never mutate configuration; confirm is a separate step.
 */

export type BulkImportRowStatus =
  | "create"
  | "reuse"
  | "skip"
  | "warning"
  | "conflict"
  | "invalid";

export type BulkImportFieldError = {
  row: number;
  field: string;
  value: string;
  reason: string;
  suggestion?: string;
};

export type BulkImportRowIssue = {
  row: number;
  status: BulkImportRowStatus;
  message: string;
  field?: string;
  value?: string;
  suggestion?: string;
};

export type BulkImportCounts = {
  totalRows: number;
  validRows: number;
  warningRows: number;
  invalidRows: number;
  createCount: number;
  reuseCount: number;
  skipCount: number;
  conflictCount: number;
};

export type BulkImportCompletionSummary = {
  importedBy: string;
  importedAtIso: string;
  fileName: string | null;
  createdCount: number;
  skippedCount: number;
  warningCount: number;
  failedCount: number;
  message: string;
};

export const BULK_IMPORT_MAX_BYTES = 2_000_000;
export const BULK_IMPORT_MAX_ROWS = 2_000;

export function emptyBulkImportCounts(totalRows = 0): BulkImportCounts {
  return {
    totalRows,
    validRows: 0,
    warningRows: 0,
    invalidRows: 0,
    createCount: 0,
    reuseCount: 0,
    skipCount: 0,
    conflictCount: 0,
  };
}

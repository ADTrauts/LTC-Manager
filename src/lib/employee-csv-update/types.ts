export type EmployeeCsvChange = {
  field: string; column: number; header: string; before: string | null; after: string | null; clear: boolean;
};
export type EmployeeCsvPreviewRow = {
  row: number; employeeId: string | null; employee: string; match: string;
  status: "ready" | "unchanged" | "blocked"; changes: EmployeeCsvChange[]; message: string;
};
export type EmployeeCsvPreview = {
  rows: EmployeeCsvPreviewRow[]; reviewToken: string; expiresAt: string;
  sourceHash: string; fileName: string; contractVersion: string; templateVersion: string;
};
export type EmployeeCsvRowResult = {
  row: number; employeeId: string | null; status: "committed" | "unchanged" | "blocked" | "failed";
  message: string; committedAt?: string;
};
export type EmployeeCsvResult = {
  rows: EmployeeCsvRowResult[]; committed: number; unchanged: number; blocked: number; failed: number; sourceHash: string;
};

export type EmployeeCsvActionOutcome<T> = { ok: true; data: T } | { ok: false; error: string };

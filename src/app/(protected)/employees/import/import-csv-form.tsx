"use client";

import { useState } from "react";
import { confirmEmployeeCsvAction, previewEmployeeCsvAction } from "@/app/(protected)/employees/csv-import-actions";
import { EMPLOYEE_CSV_TEMPLATE, EMPLOYEE_UPDATE_CONTRACT } from "@/lib/employee-csv-import";
import type { EmployeeCsvPreview, EmployeeCsvResult } from "@/lib/employee-csv-update/types";

export function ImportCsvForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<EmployeeCsvPreview | null>(null);
  const [result, setResult] = useState<EmployeeCsvResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function formData() {
    if (!file) throw new Error("Choose a CSV file.");
    const data = new FormData();
    data.set("file", file);
    data.set("contractVersion", EMPLOYEE_UPDATE_CONTRACT);
    return data;
  }
  async function validate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null); setResult(null); setPreview(null); setPending(true);
    try {
      const response = await previewEmployeeCsvAction(formData());
      if (!response.ok) throw new Error(response.error);
      setPreview(response.data);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not preview this file."); }
    finally { setPending(false); }
  }
  async function confirm() {
    if (!preview) return;
    setError(null); setPending(true);
    const data = formData();
    data.set("reviewToken", preview.reviewToken);
    // Consume this UI review before sending. A network error requires reconciliation/new preview.
    setPreview(null);
    try {
      const response = await confirmEmployeeCsvAction(data);
      if (!response.ok) throw new Error(response.error);
      setResult(response.data);
    }
    catch (cause) { setError(`${cause instanceof Error ? cause.message : "Confirmation response unavailable."} Review the roster and preview again before retrying; some rows may already have committed.`); }
    finally { setPending(false); }
  }
  const allowedRows = preview?.rows.filter((row) => row.status === "ready").length ?? 0;
  return (
    <div className="space-y-6" data-testid="employee-csv-import">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Update existing employees</h2>
        <p className="mt-2 text-sm text-zinc-600">Download a template, upload, validate, review changes, then confirm. Upload and preview save nothing. Maximum 500 rows and 2 MB.</p>
        <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(EMPLOYEE_CSV_TEMPLATE)}`} download="vssyl-employee-update-template.csv" className="mt-2 inline-block text-sm font-medium underline">Download template CSV</a>
        <form onSubmit={validate} className="mt-4 space-y-3">
          <label className="block text-sm text-zinc-700">File (.csv)
            <input type="file" name="file" accept=".csv,text/csv" required disabled={pending} className="mt-1 block w-full text-sm"
              onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setResult(null); setError(null); }} />
          </label>
          <button type="submit" disabled={pending || !file} className="app-button app-accent-button disabled:opacity-50">{pending ? "Working…" : "Validate and preview"}</button>
        </form>
        {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      </div>
      {preview ? (
        <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6" aria-label="Employee update preview">
          <h2 className="text-lg font-semibold">Review changes</h2>
          <p className="text-sm">{allowedRows} row(s) with changes, {preview.rows.filter((row) => row.status === "unchanged").length} unchanged, {preview.rows.filter((row) => row.status === "blocked").length} blocked. Review expires {new Date(preview.expiresAt).toLocaleTimeString()}.</p>
          <p className="text-sm text-zinc-700">Each employee commits in a separate transaction. Allowed rows may commit while another row fails. Blocked rows are excluded. There is no file-wide rollback.</p>
          <div className="max-h-[32rem] space-y-3 overflow-y-auto">
            {preview.rows.map((row) => (
              <article key={row.row} className="rounded-lg border border-zinc-200 p-3 text-sm">
                <h3 className="font-semibold">Row {row.row}: {row.employee} — {row.status}</h3>
                <p className="break-all text-xs text-zinc-600">{row.employeeId ? `${row.match}: ${row.employeeId}` : row.match}</p>
                <p className="mt-1">{row.message}</p>
                {row.changes.length ? <dl className="mt-2 space-y-2">{row.changes.map((change) => (
                  <div key={change.field} className="rounded bg-zinc-50 p-2">
                    <dt className="font-medium">Column {change.column}: {change.header}{change.clear ? " — explicit clear" : ""}</dt>
                    <dd className="whitespace-pre-wrap break-words">Before: {change.before ?? "(empty)"}</dd>
                    <dd className="whitespace-pre-wrap break-words">After: {change.after ?? "(empty)"}</dd>
                  </div>
                ))}</dl> : null}
              </article>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void confirm()} disabled={pending || !allowedRows} className="app-button app-accent-button disabled:opacity-50">Confirm reviewed updates</button>
            <button type="button" onClick={() => setPreview(null)} disabled={pending} className="app-button">Cancel preview</button>
          </div>
        </section>
      ) : null}
      {result ? (
        <section role="status" className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6" aria-label="Employee update results">
          <h2 className="text-lg font-semibold">Results</h2>
          <p className="mt-2 text-sm">Committed {result.committed}, unchanged {result.unchanged}, blocked {result.blocked}, failed {result.failed}.</p>
          <p className="mt-2 text-sm">Committed rows remain saved. Correct blocked/failed rows and preview again. Already-applied updates are unchanged on retry.</p>
          <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm">{result.rows.map((row) => <li key={row.row}>Row {row.row}: <strong>{row.status}</strong> — {row.message}</li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";

import { importEmployeesFromCsvAction, type CsvImportResult } from "@/app/(protected)/employees/csv-import-actions";
import { EMPLOYEE_CSV_TEMPLATE } from "@/lib/employee-csv-import";

export function ImportCsvForm() {
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFatal(null);
    setResult(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    setPending(true);
    try {
      const r = await importEmployeesFromCsvAction(fd);
      setResult(r);
      form.reset();
    } catch (err) {
      setFatal(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setPending(false);
    }
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(EMPLOYEE_CSV_TEMPLATE)}`;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Upload CSV</h2>
        <p className="mt-2 text-sm text-zinc-600">
          <span className="font-medium text-zinc-800">Upsert:</span> rows match an existing employee by{" "}
          <span className="font-medium">email</span> (if provided) or by{" "}
          <span className="font-medium">first + last name</span>. New rows cannot use status TERMINATED; use ACTIVE
          or OFF first. Updates may set TERMINATED (adds a termination snapshot). Max 500 rows, 2 MB.
        </p>
        <p className="mt-2 text-sm">
          <a
            href={templateHref}
            download="ltc-employee-import-template.csv"
            className="font-medium text-zinc-800 underline hover:text-zinc-950"
          >
            Download template CSV
          </a>
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block text-sm text-zinc-700">
            <span className="text-xs text-zinc-600">File (.csv)</span>
            <input
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              className="mt-1 block w-full text-sm"
            />
          </label>
          {fatal ? <p className="text-sm text-red-700">{fatal}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {pending ? "Importing…" : "Run import"}
          </button>
        </form>
      </div>

      {result ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-900">Result</h3>
          <p className="mt-2 text-sm text-zinc-700">
            Created <span className="font-medium">{result.created}</span>, updated{" "}
            <span className="font-medium">{result.updated}</span>.
            {result.errors.length > 0 ? (
              <>
                {" "}
                <span className="font-medium text-amber-800">{result.errors.length}</span> row(s) failed.
              </>
            ) : null}
          </p>
          {result.errors.length > 0 ? (
            <ul className="mt-3 max-h-64 list-inside list-disc space-y-1 overflow-y-auto text-sm text-red-800">
              {result.errors.map((e, i) => (
                <li key={`${e.row}-${i}`}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

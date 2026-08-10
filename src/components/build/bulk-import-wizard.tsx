"use client";

import { useState, useTransition } from "react";

import type { BulkImportCounts, BulkImportCompletionSummary, BulkImportRowIssue } from "@/lib/bulk-import/types";

export type BulkImportWizardStep =
  | "template"
  | "upload"
  | "preview"
  | "complete";

export type HierarchyPreviewLocation = {
  name: string;
  typeLabel: string;
  roomNumber: string | null;
  action: "create" | "reuse" | "skip";
  metaLine: string;
};

export type HierarchyPreviewNeighborhood = {
  name: string;
  action: "create" | "reuse";
  /** @deprecated Prefer locationCounts */
  spaceCounts: Record<string, number>;
  spaceTotal: number;
  locationCounts?: Record<string, number>;
  locationTotal?: number;
  locations?: HierarchyPreviewLocation[];
};

export type HierarchyPreviewFloor = {
  name: string;
  action: "create" | "reuse";
  neighborhoods: HierarchyPreviewNeighborhood[];
};

export type BulkImportPreviewModel = {
  counts: BulkImportCounts;
  issues: BulkImportRowIssue[];
  canConfirm: boolean;
  summaryLines: string[];
  hierarchyPreview?: HierarchyPreviewFloor[];
  rowPreview?: Array<{
    rowNumber: number;
    status: string;
    label: string;
    detail?: string;
  }>;
  validationCsv?: string;
};

type Props = {
  title: string;
  description: string;
  templateFileName: string;
  templateCsv: string;
  instructions: React.ReactNode;
  testIdPrefix: string;
  onPreview: (file: File) => Promise<BulkImportPreviewModel>;
  onConfirm: (file: File) => Promise<BulkImportCompletionSummary>;
  onClose?: () => void;
};

const STEPS: Array<{ key: BulkImportWizardStep; label: string }> = [
  { key: "template", label: "1. Template" },
  { key: "upload", label: "2. Upload" },
  { key: "preview", label: "3–5. Validate & Confirm" },
  { key: "complete", label: "6. Summary" },
];

export function BulkImportWizard({
  title,
  description,
  templateFileName,
  templateCsv,
  instructions,
  testIdPrefix,
  onPreview,
  onConfirm,
  onClose,
}: Props) {
  const [step, setStep] = useState<BulkImportWizardStep>("template");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BulkImportPreviewModel | null>(null);
  const [summary, setSummary] = useState<BulkImportCompletionSummary | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv)}`;
  const validationHref = preview?.validationCsv
    ? `data:text/csv;charset=utf-8,${encodeURIComponent(preview.validationCsv)}`
    : null;

  function resetToUpload() {
    setPreview(null);
    setSummary(null);
    setFatal(null);
    setStep("upload");
  }

  function handleValidate() {
    if (!file) {
      setFatal("Choose a CSV file first.");
      return;
    }
    setFatal(null);
    startTransition(async () => {
      try {
        const model = await onPreview(file);
        setPreview(model);
        setStep("preview");
      } catch (err) {
        setFatal(err instanceof Error ? err.message : "Validation failed.");
      }
    });
  }

  function handleConfirm() {
    if (!file || !preview?.canConfirm) return;
    setFatal(null);
    startTransition(async () => {
      try {
        const result = await onConfirm(file);
        setSummary(result);
        setStep("complete");
      } catch (err) {
        setFatal(err instanceof Error ? err.message : "Import failed.");
      }
    });
  }

  return (
    <div
      className="space-y-4"
      data-testid={`${testIdPrefix}-wizard`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
            data-testid={`${testIdPrefix}-close`}
          >
            Close
          </button>
        ) : null}
      </header>

      <ol className="flex flex-wrap gap-2 text-xs font-medium text-zinc-600">
        {STEPS.map((s) => (
          <li
            key={s.key}
            className={`rounded-md border px-2 py-1 ${
              step === s.key
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white"
            }`}
          >
            {s.label}
          </li>
        ))}
      </ol>

      {fatal ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-testid={`${testIdPrefix}-fatal`}>
          {fatal}
        </p>
      ) : null}

      {step === "template" ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid={`${testIdPrefix}-step-template`}>
          <h3 className="text-sm font-semibold text-zinc-900">Step 1 — Download Template</h3>
          <div className="mt-3 space-y-3 text-sm text-zinc-700">{instructions}</div>
          <a
            href={templateHref}
            download={templateFileName}
            className="mt-4 inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700"
            data-testid={`${testIdPrefix}-download-template`}
          >
            Download CSV template
          </a>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setStep("upload")}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              data-testid={`${testIdPrefix}-continue-upload`}
            >
              Continue to upload
            </button>
          </div>
        </section>
      ) : null}

      {step === "upload" ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid={`${testIdPrefix}-step-upload`}>
          <h3 className="text-sm font-semibold text-zinc-900">Step 2 — Upload Completed File</h3>
          <p className="mt-2 text-sm text-zinc-600">
            Uploading validates and previews only. Nothing is written until you confirm.
          </p>
          <label className="mt-4 block text-sm text-zinc-700">
            <span className="text-xs text-zinc-600">File (.csv)</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="mt-1 block w-full text-sm"
              data-testid={`${testIdPrefix}-file-input`}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setFatal(null);
              }}
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!file || pending}
              onClick={handleValidate}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
              data-testid={`${testIdPrefix}-validate`}
            >
              {pending ? "Validating…" : "Validate & preview"}
            </button>
            <button
              type="button"
              onClick={() => setStep("template")}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Back
            </button>
          </div>
        </section>
      ) : null}

      {step === "preview" && preview ? (
        <section className="space-y-4" data-testid={`${testIdPrefix}-step-preview`}>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-900">Steps 3–4 — Validate & Preview</h3>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" data-testid={`${testIdPrefix}-counts`}>
              <div><dt className="text-zinc-500">Total</dt><dd className="font-semibold">{preview.counts.totalRows}</dd></div>
              <div><dt className="text-zinc-500">Valid</dt><dd className="font-semibold text-emerald-800">{preview.counts.validRows}</dd></div>
              <div><dt className="text-zinc-500">Warnings</dt><dd className="font-semibold text-amber-800">{preview.counts.warningRows}</dd></div>
              <div><dt className="text-zinc-500">Invalid</dt><dd className="font-semibold text-red-800">{preview.counts.invalidRows}</dd></div>
              <div><dt className="text-zinc-500">Create</dt><dd className="font-semibold">{preview.counts.createCount}</dd></div>
              <div><dt className="text-zinc-500">Skip / reuse</dt><dd className="font-semibold">{preview.counts.skipCount + preview.counts.reuseCount}</dd></div>
              <div><dt className="text-zinc-500">Conflicts</dt><dd className="font-semibold">{preview.counts.conflictCount}</dd></div>
            </dl>
            <ul className="mt-3 list-inside list-disc text-sm text-zinc-700">
              {preview.summaryLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          {preview.hierarchyPreview && preview.hierarchyPreview.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid={`${testIdPrefix}-hierarchy-preview`}>
              <h4 className="text-sm font-semibold text-zinc-900">Hierarchy preview</h4>
              <div className="mt-3 space-y-3 text-sm text-zinc-800">
                {preview.hierarchyPreview.map((floor) => (
                  <div key={floor.name}>
                    <p className="font-medium">
                      {floor.name}{" "}
                      <span className="text-xs font-normal text-zinc-500">({floor.action})</span>
                    </p>
                    <ul className="mt-1 space-y-1 pl-4">
                      {floor.neighborhoods.map((nbh) => {
                        const locationTotal = nbh.locationTotal ?? nbh.spaceTotal;
                        const locationCounts = nbh.locationCounts ?? nbh.spaceCounts;
                        return (
                          <li key={`${floor.name}-${nbh.name}`}>
                            <span className="font-medium">{nbh.name}</span>{" "}
                            <span className="text-xs text-zinc-500">({nbh.action})</span>
                            <span className="block text-xs text-zinc-600">
                              {locationTotal} location{locationTotal === 1 ? "" : "s"}
                              {Object.entries(locationCounts)
                                .map(([label, n]) => ` · ${n} ${label}`)
                                .join("")}
                            </span>
                            {nbh.locations && nbh.locations.length > 0 ? (
                              <ul className="mt-1 space-y-1 pl-4 text-xs text-zinc-700">
                                {nbh.locations.slice(0, 40).map((loc) => (
                                  <li key={`${nbh.name}-${loc.name}`}>
                                    <span className="font-medium text-zinc-800">{loc.name}</span>
                                    <span className="block text-zinc-600">{loc.metaLine}</span>
                                  </li>
                                ))}
                                {nbh.locations.length > 40 ? (
                                  <li className="text-zinc-500">
                                    …and {nbh.locations.length - 40} more
                                  </li>
                                ) : null}
                              </ul>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {preview.rowPreview && preview.rowPreview.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid={`${testIdPrefix}-row-preview`}>
              <h4 className="text-sm font-semibold text-zinc-900">Row preview</h4>
              <table className="mt-3 min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500">
                    <th className="py-1 pr-3 font-medium">Row</th>
                    <th className="py-1 pr-3 font-medium">Status</th>
                    <th className="py-1 pr-3 font-medium">Item</th>
                    <th className="py-1 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rowPreview.slice(0, 100).map((r) => (
                    <tr key={`${r.rowNumber}-${r.label}`} className="border-b border-zinc-100">
                      <td className="py-1 pr-3">{r.rowNumber}</td>
                      <td className="py-1 pr-3">{r.status}</td>
                      <td className="py-1 pr-3">{r.label}</td>
                      <td className="py-1 text-zinc-600">{r.detail ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rowPreview.length > 100 ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Showing first 100 rows. Download validation results for the full set.
                </p>
              ) : null}
            </div>
          ) : null}

          {preview.issues.length > 0 ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4" data-testid={`${testIdPrefix}-issues`}>
              <h4 className="text-sm font-semibold text-red-900">Validation issues</h4>
              <ul className="mt-2 max-h-64 list-inside list-disc space-y-1 overflow-y-auto text-sm text-red-900">
                {preview.issues.slice(0, 200).map((issue, i) => (
                  <li key={`${issue.row}-${issue.field ?? ""}-${i}`}>
                    Row {issue.row}
                    {issue.field ? ` · ${issue.field}` : ""}
                    {issue.value ? ` · "${issue.value}"` : ""}: {issue.message}
                    {issue.suggestion ? ` — ${issue.suggestion}` : ""}
                  </li>
                ))}
              </ul>
              {validationHref ? (
                <a
                  href={validationHref}
                  download={`${testIdPrefix}-validation-results.csv`}
                  className="mt-3 inline-flex text-sm font-medium text-red-900 underline"
                  data-testid={`${testIdPrefix}-download-errors`}
                >
                  Download validation results CSV
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!preview.canConfirm || pending}
              onClick={handleConfirm}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
              data-testid={`${testIdPrefix}-confirm`}
            >
              {pending ? "Importing…" : "Step 5 — Confirm import"}
            </button>
            <button
              type="button"
              onClick={resetToUpload}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              data-testid={`${testIdPrefix}-cancel`}
            >
              Cancel (no changes)
            </button>
          </div>
          {!preview.canConfirm ? (
            <p className="text-sm text-amber-800">
              Fix invalid rows before confirming. Cancel leaves configuration unchanged.
            </p>
          ) : null}
        </section>
      ) : null}

      {step === "complete" && summary ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4" data-testid={`${testIdPrefix}-complete`}>
          <h3 className="text-sm font-semibold text-emerald-950">Step 6 — Completion summary</h3>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-emerald-950 sm:grid-cols-3">
            <div><dt className="text-emerald-800">Imported by</dt><dd className="font-medium">{summary.importedBy}</dd></div>
            <div><dt className="text-emerald-800">When</dt><dd className="font-medium">{summary.importedAtIso}</dd></div>
            <div><dt className="text-emerald-800">File</dt><dd className="font-medium">{summary.fileName ?? "—"}</dd></div>
            <div><dt className="text-emerald-800">Created</dt><dd className="font-medium">{summary.createdCount}</dd></div>
            <div><dt className="text-emerald-800">Skipped</dt><dd className="font-medium">{summary.skippedCount}</dd></div>
            <div><dt className="text-emerald-800">Warnings</dt><dd className="font-medium">{summary.warningCount}</dd></div>
            <div><dt className="text-emerald-800">Failed</dt><dd className="font-medium">{summary.failedCount}</dd></div>
          </dl>
          <p className="mt-3 text-sm text-emerald-900">{summary.message}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setSummary(null);
                setStep("template");
              }}
              className="rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-100"
            >
              Import another file
            </button>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-emerald-900 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                data-testid={`${testIdPrefix}-done`}
              >
                Done
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { clearUnionHandbookAction, uploadUnionHandbookAction } from "./actions";

type UnionHandbookSettingsProps = {
  hasPdf: boolean;
  originalFilename: string | null;
  uploadedAtIso: string | null;
  effectiveDateIso: string | null;
};

export function UnionHandbookSettings({
  hasPdf,
  originalFilename,
  uploadedAtIso,
  effectiveDateIso,
}: UnionHandbookSettingsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onUpload(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await uploadUnionHandbookAction(formData);
      router.refresh();
    } catch {
      setError("Could not upload PDF. Use a single PDF under 12 MB.");
    } finally {
      setPending(false);
    }
  }

  async function onClear() {
    setPending(true);
    setError(null);
    try {
      await clearUnionHandbookAction();
      router.refresh();
    } catch {
      setError("Could not remove file.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Union handbook (PDF)</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Store the current union handbook for managers to reference during discipline steps. Managers can open
          it from the Employees discipline section.
        </p>
      </div>
      {hasPdf ? (
        <p className="text-sm text-zinc-700">
          <span className="font-medium">{originalFilename ?? "Handbook"}</span>
          {uploadedAtIso ? (
            <span className="text-zinc-500"> · Uploaded {new Date(uploadedAtIso).toLocaleString()}</span>
          ) : null}
          {effectiveDateIso ? (
            <span className="text-zinc-500"> · Effective {effectiveDateIso}</span>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-zinc-500">No PDF uploaded yet.</p>
      )}
      <form action={onUpload} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-zinc-700">
            <span className="block text-xs text-zinc-600">Replace PDF</span>
            <input name="file" type="file" accept="application/pdf,.pdf" className="mt-1 block text-sm" />
          </label>
          <label className="text-sm text-zinc-700">
            <span className="block text-xs text-zinc-600">Effective date (optional)</span>
            <input
              name="effectiveDate"
              type="date"
              defaultValue={effectiveDateIso ?? ""}
              className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {pending ? "Saving…" : hasPdf ? "Upload replacement / save date" : "Upload PDF"}
          </button>
          {hasPdf ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void onClear()}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              Remove PDF
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

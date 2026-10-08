"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { correctPartnerCanonicalLogAction } from "@/app/partner/logs/actions";
import type { EvidenceFieldValueInput } from "@/lib/operational-evidence/types";

export function PartnerLogCorrectionForm({
  recordId,
  fields,
}: {
  recordId: string;
  fields: Array<{ fieldKey: string; label: string; displayValue: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.fieldKey, field.displayValue === "—" ? "" : field.displayValue])),
  );

  function submit() {
    setError(null);
    if (!reason.trim()) {
      setError("A correction reason is required.");
      return;
    }
    const payload: EvidenceFieldValueInput[] = fields.map((field) => ({
      fieldKey: field.fieldKey,
      valueText: values[field.fieldKey]?.trim() || null,
    }));
    startTransition(async () => {
      const result = await correctPartnerCanonicalLogAction({ recordId, reason, values: payload });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(result.redirectTo);
      router.refresh();
    });
  }

  return (
    <form
      className="space-y-3 rounded-md border border-zinc-200 bg-white p-4"
      data-testid="partner-log-correction"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="text-sm font-medium">Correct this record</p>
      {fields.map((field) => (
        <label key={field.fieldKey} className="block text-sm">
          {field.label}
          <input
            value={values[field.fieldKey] ?? ""}
            onChange={(event) => setValues((prev) => ({ ...prev, [field.fieldKey]: event.target.value }))}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5"
          />
        </label>
      ))}
      <label className="block text-sm">
        Reason
        <textarea
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5"
        />
      </label>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
      >
        {pending ? "Saving…" : "Save correction"}
      </button>
    </form>
  );
}

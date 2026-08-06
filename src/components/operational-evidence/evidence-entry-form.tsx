"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { submitUnitEvidenceAction } from "@/app/(protected)/unit/[unitId]/evidence-actions";
import type { EvidenceRequirement } from "@/lib/operational-evidence/types";

type Props = {
  facilityId: string;
  departmentId: string;
  unitId: string;
  requirement: EvidenceRequirement;
  readOnly?: boolean;
};

export function EvidenceEntryForm({
  facilityId,
  departmentId,
  unitId,
  requirement,
  readOnly = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [correctiveActionText, setCorrectiveActionText] = useState("");

  const completed = ["COMPLETED", "COMPLETED_WITH_CORRECTIVE_ACTION", "NEEDS_REVIEW"].includes(
    requirement.state,
  );
  const locked = readOnly || completed;

  const outOfStandardPreview = useMemo(() => {
    return requirement.fields.some((field) => {
      if (!field.correctiveActionTrigger) return false;
      if (field.fieldType === "TEMPERATURE" || field.fieldType === "NUMBER") {
        const n = Number(values[field.fieldKey]);
        if (!Number.isFinite(n)) return false;
        if (field.minNumber != null && n < field.minNumber) return true;
        if (field.maxNumber != null && n > field.maxNumber) return true;
      }
      if (field.fieldType === "PASS_NEEDS_ATTENTION") {
        return values[field.fieldKey] === "NEEDS_ATTENTION";
      }
      if (field.fieldType === "YES_NO") {
        return values[field.fieldKey] === "NO";
      }
      return false;
    });
  }, [requirement.fields, values]);

  const correctiveRequired = requirement.fields.some(
    (f) => f.correctiveActionRequired && f.correctiveActionTrigger,
  );

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const payload = requirement.fields.map((field) => {
          const raw = values[field.fieldKey] ?? "";
          if (field.fieldType === "NUMBER" || field.fieldType === "TEMPERATURE") {
            return { fieldKey: field.fieldKey, valueNumber: raw === "" ? null : Number(raw) };
          }
          if (
            field.fieldType === "YES_NO" ||
            field.fieldType === "PASS_NEEDS_ATTENTION" ||
            field.fieldType === "ATTESTATION"
          ) {
            return { fieldKey: field.fieldKey, valueText: raw || null };
          }
          if (field.fieldType === "MULTI_SELECT") {
            return {
              fieldKey: field.fieldKey,
              valueSelections: raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [],
            };
          }
          return { fieldKey: field.fieldKey, valueText: raw || null };
        });

        await submitUnitEvidenceAction({
          facilityId,
          departmentId,
          unitId,
          templateId: requirement.templateId,
          requirementKey: requirement.requirementKey,
          operationalDateKey: requirement.operationalDateKey,
          scheduleKind: requirement.scheduleKind,
          cycleStableKey: requirement.cycleStableKey,
          cycleLabel: requirement.cycleLabel,
          windowStartLocal: requirement.windowStartLocal,
          windowEndLocal: requirement.windowEndLocal,
          spaceId: requirement.spaceId,
          assetId: requirement.assetId,
          values: payload,
          correctiveActionText: outOfStandardPreview ? correctiveActionText : null,
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Submit failed.");
      }
    });
  }

  return (
    <section
      className="rounded-md border border-zinc-200 bg-white p-4"
      data-testid="evidence-entry-form"
      data-requirement-key={requirement.requirementKey}
      data-requirement-state={requirement.state}
    >
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {requirement.purposeType} · {requirement.stateLabel}
        </p>
        <h2 className="text-base font-semibold text-zinc-900">{requirement.templateName}</h2>
        <p className="text-xs text-zinc-600">
          Operational date {requirement.operationalDateKey}
          {requirement.windowStartLocal
            ? ` · ${requirement.windowStartLocal}–${requirement.windowEndLocal ?? ""}`
            : ""}
          {requirement.cycleLabel ? ` · ${requirement.cycleLabel}` : ""}
          {requirement.assetId ? ` · Asset ${requirement.assetId}` : ""}
        </p>
        {requirement.instructions ? (
          <p className="text-sm text-zinc-700">{requirement.instructions}</p>
        ) : null}
      </header>

      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {requirement.fields.map((field) => (
          <label key={field.fieldKey} className="block space-y-1">
            <span className="text-sm font-medium text-zinc-800">
              {field.label}
              {field.isRequired ? " *" : ""}
              {field.unitLabel ? ` (${field.unitLabel})` : ""}
            </span>
            {field.helpText ? <span className="block text-xs text-zinc-500">{field.helpText}</span> : null}
            {field.fieldType === "LONG_TEXT" || field.fieldType === "OPTIONAL_COMMENT" ? (
              <textarea
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                rows={3}
                disabled={locked || pending}
                value={values[field.fieldKey] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.fieldKey]: e.target.value }))}
                data-testid={`evidence-field-${field.fieldKey}`}
              />
            ) : field.fieldType === "YES_NO" ||
              field.fieldType === "PASS_NEEDS_ATTENTION" ||
              field.fieldType === "ATTESTATION" ||
              field.fieldType === "SINGLE_SELECT" ? (
              <select
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                disabled={locked || pending}
                value={values[field.fieldKey] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.fieldKey]: e.target.value }))}
                data-testid={`evidence-field-${field.fieldKey}`}
              >
                <option value="">Select…</option>
                {field.fieldType === "YES_NO" ? (
                  <>
                    <option value="YES">Yes</option>
                    <option value="NO">No</option>
                  </>
                ) : null}
                {field.fieldType === "PASS_NEEDS_ATTENTION" ? (
                  <>
                    <option value="PASS">Pass</option>
                    <option value="NEEDS_ATTENTION">Needs Attention</option>
                  </>
                ) : null}
                {field.fieldType === "ATTESTATION" ? (
                  <option value="ATTESTED">Attested</option>
                ) : null}
                {field.allowedSelections.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={
                  field.fieldType === "NUMBER" || field.fieldType === "TEMPERATURE"
                    ? "number"
                    : field.fieldType === "DATE"
                      ? "date"
                      : field.fieldType === "TIME"
                        ? "time"
                        : "text"
                }
                inputMode={
                  field.fieldType === "NUMBER" || field.fieldType === "TEMPERATURE"
                    ? "decimal"
                    : undefined
                }
                step="any"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                disabled={locked || pending}
                value={values[field.fieldKey] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.fieldKey]: e.target.value }))}
                data-testid={`evidence-field-${field.fieldKey}`}
              />
            )}
          </label>
        ))}
      </div>

      {outOfStandardPreview || (correctiveRequired && outOfStandardPreview) ? (
        <label className="mt-4 block space-y-1" data-testid="evidence-corrective-action">
          <span className="text-sm font-medium text-amber-900">Corrective action required</span>
          <textarea
            className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
            rows={3}
            disabled={locked || pending}
            value={correctiveActionText}
            onChange={(e) => setCorrectiveActionText(e.target.value)}
            data-testid="evidence-corrective-action-text"
          />
        </label>
      ) : null}

      {!locked ? (
        <button
          type="button"
          className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={pending}
          onClick={submit}
          data-testid="evidence-submit"
        >
          {pending ? "Submitting…" : "Submit evidence"}
        </button>
      ) : (
        <p className="mt-4 text-sm text-zinc-600" data-testid="evidence-completed-view">
          Record {requirement.stateLabel}
          {requirement.recordId ? ` · ${requirement.recordId}` : ""}
        </p>
      )}
    </section>
  );
}

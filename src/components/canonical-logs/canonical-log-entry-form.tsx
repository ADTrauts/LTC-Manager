"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { submitCanonicalRunLogAction } from "@/app/(protected)/staffing/logs/actions";
import type { RunLogRequirementView } from "@/lib/canonical-logs/run-presentation";

type FieldDef = RunLogRequirementView["fields"][number];

type Props = {
  facilityId: string;
  departmentId: string;
  attachmentId: string;
  operationalDateKey: string;
  displayName: string;
  catalogDefinitionName: string;
  targetLabel: string;
  timingContextLabel: string;
  catalogInstructions: string | null;
  localInstructions: string | null;
  fields: FieldDef[];
  requirementKey: string | null;
  cycleStableKey: string | null;
  cycleLabel: string | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  adHoc?: boolean;
  readOnly?: boolean;
  cancelHref: string;
};

function rangeLabel(field: FieldDef): string | null {
  if (field.minNumber == null && field.maxNumber == null) return null;
  const unit = field.unitLabel?.trim() ?? "";
  if (field.minNumber != null && field.maxNumber != null) {
    return `${field.minNumber}${unit}–${field.maxNumber}${unit}`;
  }
  if (field.minNumber != null) return `≥ ${field.minNumber}${unit}`;
  return `≤ ${field.maxNumber}${unit}`;
}

function fieldOutOfRange(field: FieldDef, raw: string): boolean {
  if (!field.correctiveActionTrigger) return false;
  if (field.fieldType === "TEMPERATURE" || field.fieldType === "NUMBER") {
    const n = Number(raw);
    if (!Number.isFinite(n) || raw.trim() === "") return false;
    if (field.minNumber != null && n < field.minNumber) return true;
    if (field.maxNumber != null && n > field.maxNumber) return true;
  }
  if (field.fieldType === "PASS_NEEDS_ATTENTION") return raw === "NEEDS_ATTENTION";
  if (field.fieldType === "YES_NO") return raw === "NO";
  return false;
}

export function CanonicalLogEntryForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>({});
  const [correctiveActionText, setCorrectiveActionText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [existingRecordId, setExistingRecordId] = useState<string | null>(null);
  const [offlineNote, setOfflineNote] = useState<string | null>(null);

  const outOfStandard = useMemo(
    () => props.fields.some((f) => fieldOutOfRange(f, values[f.fieldKey] ?? "")),
    [props.fields, values],
  );

  const correctiveRequired = props.fields.some(
    (f) => f.correctiveActionRequired && f.correctiveActionTrigger,
  );

  function setValue(fieldKey: string, value: string) {
    setValues((prev) => ({ ...prev, [fieldKey]: value }));
  }

  function buildPayload() {
    return props.fields.map((field) => {
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
          valueSelections: raw
            ? raw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
        };
      }
      return { fieldKey: field.fieldKey, valueText: raw || null };
    });
  }

  function submit() {
    setError(null);
    setExistingRecordId(null);
    if (outOfStandard && correctiveRequired && !correctiveActionText.trim()) {
      setError("Corrective action is required for out-of-range results.");
      return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setOfflineNote(
        "You appear offline. Open this Log online first, or use a Unit Workspace offline bundle when available.",
      );
      return;
    }

    startTransition(async () => {
      const result = await submitCanonicalRunLogAction({
        facilityId: props.facilityId,
        departmentId: props.departmentId,
        logAttachmentId: props.attachmentId,
        requirementKey: props.requirementKey,
        operationalDateKey: props.operationalDateKey,
        cycleStableKey: props.cycleStableKey,
        cycleLabel: props.cycleLabel,
        windowStartLocal: props.windowStartLocal,
        windowEndLocal: props.windowEndLocal,
        values: buildPayload(),
        correctiveActionText: outOfStandard ? correctiveActionText : null,
        adHoc: props.adHoc === true,
      });
      if (!result.ok) {
        setError(result.error);
        if (result.existingRecordId) setExistingRecordId(result.existingRecordId);
        return;
      }
      router.push(result.redirectTo);
      router.refresh();
    });
  }

  return (
    <section className="space-y-4" data-testid="canonical-log-entry-form">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-zinc-900">{props.displayName}</h1>
        {props.displayName !== props.catalogDefinitionName ? (
          <p className="text-xs text-zinc-500">{props.catalogDefinitionName}</p>
        ) : null}
        <p className="text-sm text-zinc-700">{props.targetLabel}</p>
        {props.timingContextLabel ? (
          <p className="text-xs text-zinc-600">{props.timingContextLabel}</p>
        ) : null}
      </header>

      {props.catalogInstructions ? (
        <p className="text-sm text-zinc-700">{props.catalogInstructions}</p>
      ) : null}
      {props.localInstructions ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
          <span className="font-medium">Facility note: </span>
          {props.localInstructions}
        </p>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
          <p>{error}</p>
          {existingRecordId ? (
            <Link
              href={`/staffing/logs/records/${existingRecordId}`}
              className="mt-1 inline-block font-medium underline underline-offset-2"
            >
              View record
            </Link>
          ) : null}
        </div>
      ) : null}
      {offlineNote ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {offlineNote}
        </p>
      ) : null}

      <div className="space-y-4">
        {props.fields.map((field) => {
          const raw = values[field.fieldKey] ?? "";
          const oos = fieldOutOfRange(field, raw);
          const expected = rangeLabel(field);
          const inRange =
            (field.fieldType === "TEMPERATURE" || field.fieldType === "NUMBER") &&
            raw.trim() !== "" &&
            !oos;

          return (
            <div key={field.fieldKey} className="space-y-1.5" data-testid={`log-field-${field.fieldKey}`}>
              <label className="block text-sm font-medium text-zinc-900" htmlFor={field.fieldKey}>
                {field.label}
                {field.isRequired ? <span className="text-zinc-500"> *</span> : null}
              </label>
              {field.helpText ? <p className="text-xs text-zinc-500">{field.helpText}</p> : null}

              {field.fieldType === "TEMPERATURE" || field.fieldType === "NUMBER" ? (
                <div className="flex items-center gap-2">
                  <input
                    id={field.fieldKey}
                    inputMode="decimal"
                    value={raw}
                    disabled={props.readOnly}
                    onChange={(e) => setValue(field.fieldKey, e.target.value)}
                    className="min-h-12 w-32 rounded-md border border-zinc-300 px-3 text-base"
                  />
                  {field.unitLabel ? (
                    <span className="text-sm text-zinc-600">{field.unitLabel}</span>
                  ) : null}
                </div>
              ) : null}

              {field.fieldType === "YES_NO" ? (
                <div className="flex flex-wrap gap-2">
                  {(["YES", "NO"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={props.readOnly}
                      onClick={() => setValue(field.fieldKey, opt)}
                      className={`min-h-12 min-w-[5.5rem] rounded-md border px-3 text-sm font-medium ${
                        raw === opt
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-300 bg-white text-zinc-800"
                      }`}
                    >
                      {opt === "YES" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              ) : null}

              {field.fieldType === "PASS_NEEDS_ATTENTION" ? (
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { value: "PASS", label: "Pass" },
                      { value: "NEEDS_ATTENTION", label: "Needs attention" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={props.readOnly}
                      onClick={() => setValue(field.fieldKey, opt.value)}
                      className={`min-h-12 rounded-md border px-3 text-sm font-medium ${
                        raw === opt.value
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-300 bg-white text-zinc-800"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {field.fieldType === "SINGLE_SELECT" ? (
                <select
                  id={field.fieldKey}
                  value={raw}
                  disabled={props.readOnly}
                  onChange={(e) => setValue(field.fieldKey, e.target.value)}
                  className="min-h-12 w-full max-w-md rounded-md border border-zinc-300 px-3 text-sm"
                >
                  <option value="">Select…</option>
                  {field.allowedSelections.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : null}

              {field.fieldType === "SHORT_TEXT" ||
              field.fieldType === "LONG_TEXT" ||
              field.fieldType === "OPTIONAL_COMMENT" ||
              field.fieldType === "ATTESTATION" ? (
                field.fieldType === "SHORT_TEXT" ? (
                  <input
                    id={field.fieldKey}
                    value={raw}
                    disabled={props.readOnly}
                    onChange={(e) => setValue(field.fieldKey, e.target.value)}
                    className="min-h-12 w-full max-w-md rounded-md border border-zinc-300 px-3 text-sm"
                  />
                ) : (
                  <textarea
                    id={field.fieldKey}
                    value={raw}
                    disabled={props.readOnly}
                    rows={field.fieldType === "ATTESTATION" ? 2 : 3}
                    onChange={(e) => setValue(field.fieldKey, e.target.value)}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  />
                )
              ) : null}

              {expected ? (
                <p className="text-xs text-zinc-500">Expected: {expected}</p>
              ) : null}
              {inRange ? <p className="text-xs text-zinc-600">Within range</p> : null}
              {oos ? (
                <p className="text-sm font-medium text-amber-950" data-testid="out-of-range">
                  Outside expected range
                  {expected ? <span className="font-normal"> · Expected {expected}</span> : null}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {outOfStandard ? (
        <div className="space-y-1.5" data-testid="corrective-action-field">
          <label htmlFor="corrective-action" className="block text-sm font-medium text-zinc-900">
            Corrective action
            {correctiveRequired ? <span className="text-zinc-500"> *</span> : null}
          </label>
          <p className="text-xs text-zinc-500">
            Describe what you did in response to this result.
          </p>
          <textarea
            id="corrective-action"
            value={correctiveActionText}
            disabled={props.readOnly}
            rows={3}
            placeholder="Example: moved food to another cooler and rechecked temperature."
            onChange={(e) => setCorrectiveActionText(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={pending || props.readOnly}
          onClick={submit}
          className="inline-flex min-h-12 min-w-[8rem] items-center justify-center rounded-md border border-zinc-900 bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-60"
          data-testid="submit-log"
        >
          {pending ? "Submitting…" : "Submit Log"}
        </button>
        <Link
          href={props.cancelHref}
          className="inline-flex min-h-12 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800"
        >
          Cancel
        </Link>
      </div>
    </section>
  );
}

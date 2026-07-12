"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { InspectionResponseType } from "@prisma/client";

import { submitUnitInspectionAction } from "@/app/(protected)/unit/[unitId]/actions";

export type UnitInspectionFormItem = {
  id: string;
  label: string;
  description: string | null;
  sortOrder: number;
  isRequired: boolean;
  responseType: InspectionResponseType;
};

type AnswerState = {
  passed: boolean | null;
  valueText: string;
  valueNumber: string;
  notes: string;
};

type UnitInspectionSubmitFormProps = {
  unitId: string;
  definitionId: string;
  definitionName: string;
  description: string | null;
  items: UnitInspectionFormItem[];
};

function emptyAnswers(items: UnitInspectionFormItem[]): Record<string, AnswerState> {
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      { passed: null, valueText: "", valueNumber: "", notes: "" },
    ]),
  );
}

export function UnitInspectionSubmitForm({
  unitId,
  definitionId,
  definitionName,
  description,
  items,
}: UnitInspectionSubmitFormProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState(() => emptyAnswers(items));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useMemo(
    () => `unit-insp-${definitionId}-${unitId}-${crypto.randomUUID()}`,
    [definitionId, unitId],
  );

  const answeredRequired = items.filter((item) => {
    if (!item.isRequired) return true;
    const answer = answers[item.id];
    if (!answer) return false;
    if (item.responseType === "PASS_FAIL" || item.responseType === "YES_NO") {
      return answer.passed === true || answer.passed === false;
    }
    if (item.responseType === "TEXT") return answer.valueText.trim().length > 0;
    return answer.valueNumber.trim().length > 0 && !Number.isNaN(Number(answer.valueNumber));
  }).length;
  const progressLabel = `${answeredRequired} of ${items.length} items ready`;

  function updateAnswer(itemId: string, patch: Partial<AnswerState>) {
    setAnswers((current) => ({
      ...current,
      [itemId]: { ...current[itemId]!, ...patch },
    }));
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
      data-testid="unit-inspection-form"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const formData = new FormData();
        formData.set("unitId", unitId);
        formData.set("definitionId", definitionId);
        formData.set("idempotencyKey", idempotencyKey);
        formData.set(
          "answersJson",
          JSON.stringify(
            items.map((item) => {
              const answer = answers[item.id]!;
              return {
                definitionItemId: item.id,
                passed: answer.passed,
                valueText: answer.valueText.trim() || null,
                valueNumber: answer.valueNumber.trim() ? Number(answer.valueNumber) : null,
                notes: answer.notes.trim() || null,
              };
            }),
          ),
        );

        startTransition(async () => {
          const result = await submitUnitInspectionAction(formData);
          if (!result.ok) {
            setError(result.message);
            return;
          }
          router.push(
            `/unit/${unitId}?unitTab=overview&inspectionResult=${result.result}&inspectionName=${encodeURIComponent(definitionName)}`,
          );
          router.refresh();
        });
      }}
    >
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">{definitionName}</h2>
        {description ? <p className="mt-1 text-sm text-zinc-600">{description}</p> : null}
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{progressLabel}</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-zinc-900 transition-all"
            style={{ width: `${Math.round((answeredRequired / Math.max(items.length, 1)) * 100)}%` }}
          />
        </div>
      </div>

      <ol className="space-y-4">
        {items.map((item, index) => {
          const answer = answers[item.id]!;
          return (
            <li key={item.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-sm font-semibold text-zinc-900">
                {index + 1}. {item.label}
                {item.isRequired ? <span className="text-red-600"> *</span> : null}
              </p>
              {item.description ? <p className="mt-1 text-xs text-zinc-600">{item.description}</p> : null}

              {item.responseType === "PASS_FAIL" || item.responseType === "YES_NO" ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`min-h-12 rounded-md border text-sm font-semibold touch-manipulation ${
                      answer.passed === true
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-zinc-300 bg-white text-zinc-800"
                    }`}
                    onClick={() => updateAnswer(item.id, { passed: true })}
                  >
                    {item.responseType === "YES_NO" ? "Yes" : "Pass"}
                  </button>
                  <button
                    type="button"
                    className={`min-h-12 rounded-md border text-sm font-semibold touch-manipulation ${
                      answer.passed === false
                        ? "border-amber-700 bg-amber-700 text-white"
                        : "border-zinc-300 bg-white text-zinc-800"
                    }`}
                    onClick={() => updateAnswer(item.id, { passed: false })}
                  >
                    {item.responseType === "YES_NO" ? "No" : "Fail"}
                  </button>
                </div>
              ) : null}

              {item.responseType === "TEXT" ? (
                <textarea
                  value={answer.valueText}
                  onChange={(e) => updateAnswer(item.id, { valueText: e.target.value })}
                  rows={3}
                  className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              ) : null}

              {item.responseType === "NUMBER" || item.responseType === "TEMPERATURE" ? (
                <input
                  type="number"
                  inputMode="decimal"
                  value={answer.valueNumber}
                  onChange={(e) => updateAnswer(item.id, { valueNumber: e.target.value })}
                  className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  placeholder={item.responseType === "TEMPERATURE" ? "Temperature" : "Number"}
                />
              ) : null}

              <label className="mt-3 block text-xs font-medium text-zinc-600">
                Notes (optional)
                <input
                  value={answer.notes}
                  onChange={(e) => updateAnswer(item.id, { notes: e.target.value })}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              </label>
            </li>
          );
        })}
      </ol>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white touch-manipulation hover:bg-zinc-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Submit inspection"}
        </button>
        <button
          type="button"
          className="inline-flex min-h-12 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 touch-manipulation"
          onClick={() => router.push(`/unit/${unitId}?unitTab=overview`)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

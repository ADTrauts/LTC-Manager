"use client";

import { useState } from "react";

import { CanonicalRepeatGroupControl } from "@/components/canonical-logs/canonical-repeat-group-control";
import { evaluateCalculations, type RepeatRowInput } from "@/lib/canonical-logs/template-structure";
import {
  CanonicalEvidenceFieldControl,
  expectedRangeLabel,
} from "@/components/canonical-logs/canonical-evidence-field-control";
import {
  evaluateEvidenceRules,
  formAnswersToValues,
  type CatalogEvidenceRule,
} from "@/lib/canonical-logs/evidence-rules";
import type { TemplateFieldSnapshot } from "@/lib/operational-evidence/types";

type PreviewField = {
  key: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  helpText: string;
  unitLabel: string;
  minNumber: string;
  maxNumber: string;
  allowedSelections: string[];
  correctiveActionTrigger?: boolean;
  correctiveActionRequired: boolean;
};

export type HarborCatalogPreviewModel = {
  name: string;
  purposeLabel: string;
  categoryLabel: string;
  cadenceLabel: string;
  instructions: string;
  fields: PreviewField[];
  rules?: CatalogEvidenceRule[];
  repeatingGroups?: import("@/lib/canonical-logs/template-structure").RepeatingGroupDefinition[];
  calculations?: import("@/lib/canonical-logs/template-structure").CalculationDefinition[];
};

function previewSnapshots(fields: PreviewField[]): TemplateFieldSnapshot[] {
  return fields.map((field, index) => ({
    fieldKey: field.key,
    label: field.label,
    fieldType: field.fieldType as TemplateFieldSnapshot["fieldType"],
    isRequired: field.isRequired,
    displaySequence: (index + 1) * 10,
    helpText: field.helpText || null,
    unitLabel: field.unitLabel || null,
    minNumber: field.minNumber === "" ? null : Number(field.minNumber),
    maxNumber: field.maxNumber === "" ? null : Number(field.maxNumber),
    allowedSelections: field.allowedSelections,
    correctiveActionTrigger: field.correctiveActionTrigger ?? field.correctiveActionRequired,
    correctiveActionRequired: field.correctiveActionRequired,
  }));
}

export function HarborCatalogLogPreview({ model }: { model: HarborCatalogPreviewModel }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const labeledFields = model.fields.filter((field) => field.label.trim().length > 0);
  const snapshots = previewSnapshots(labeledFields);
  const evaluation = evaluateEvidenceRules({
    fields: snapshots,
    rules: model.rules ?? [],
    values: formAnswersToValues(labeledFields.map((field) => ({ fieldKey: field.key, fieldType: field.fieldType })), values, selections),
  });
  const visible = new Set(evaluation.visibleFieldKeys);
  const required = new Set(evaluation.requiredFieldKeys);
  const [repeatRows, setRepeatRows] = useState<RepeatRowInput[]>([]);
  const calculated = evaluateCalculations({ calculations: model.calculations ?? [], rows: repeatRows });
  const outOfStandard = evaluation.outOfStandardFieldKeys.length > 0;

  return (
    <div className="space-y-4" data-testid="harbor-catalog-log-preview">
      <p className="text-xs text-zinc-500">
        Staff view. You can try the fields here; nothing is saved.
      </p>
      <header className="space-y-1">
        <h3 className="text-lg font-semibold text-zinc-900">{model.name.trim() || "Untitled log"}</h3>
        <p className="text-xs text-zinc-600">
          {model.purposeLabel} · {model.categoryLabel} · {model.cadenceLabel}
        </p>
      </header>
      {model.instructions.trim() ? (
        <p className="text-sm text-zinc-700">{model.instructions.trim()}</p>
      ) : null}

      <CanonicalRepeatGroupControl groups={model.repeatingGroups ?? []} rows={repeatRows} onChange={setRepeatRows} />
      {calculated.length > 0 ? (
        <ul className="text-sm text-zinc-700">
          {calculated.map((row) => (
            <li key={row.calculationKey}>{row.label}: {row.display}</li>
          ))}
        </ul>
      ) : null}

      {labeledFields.length === 0 && (model.repeatingGroups ?? []).length === 0 ? (
        <p className="text-sm text-zinc-600">Add a field with a label to preview it.</p>
      ) : (
        <div className="space-y-4">
          {labeledFields.filter((field) => visible.has(field.key)).map((field) => {
            const raw = values[field.key] ?? "";
            const oos = evaluation.fieldOutOfStandard[field.key] === true;
            const expected = expectedRangeLabel(field);
            const fieldId = `preview-${field.key}`;
            return (
              <div key={field.key} className="space-y-1.5">
                <label className="block text-sm font-medium text-zinc-900" htmlFor={fieldId}>
                  {field.label}
                  {required.has(field.key) ? (
                    <span className="text-zinc-500"> *</span>
                  ) : null}
                </label>
                {field.helpText ? <p className="text-xs text-zinc-500">{field.helpText}</p> : null}
                <CanonicalEvidenceFieldControl
                  field={{
                    fieldKey: field.key,
                    fieldType: field.fieldType,
                    isRequired: field.isRequired,
                    unitLabel: field.unitLabel,
                    allowedSelections: field.allowedSelections,
                  }}
                  fieldId={fieldId}
                  raw={raw}
                  selections={selections[field.key] ?? []}
                  onChange={(next) => {
                    if (next.raw !== undefined) {
                      setValues((current) => ({ ...current, [field.key]: next.raw ?? "" }));
                    }
                    if (next.selections) {
                      setSelections((current) => ({ ...current, [field.key]: next.selections ?? [] }));
                    }
                  }}
                />
                {expected ? <p className="text-xs text-zinc-500">Expected: {expected}</p> : null}
                {oos ? (
                  <p className="text-sm font-medium text-amber-950">
                    Outside expected range
                    {expected ? <span className="font-normal"> · Expected {expected}</span> : null}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {outOfStandard && evaluation.correctiveActionRequired ? (
        <div className="space-y-1.5">
          {evaluation.triggeringFields.length > 0 ? (
            <ul className="space-y-1 text-sm text-amber-950">
              {evaluation.triggeringFields.map((row) => (
                <li key={row.fieldKey}>{row.reason}</li>
              ))}
            </ul>
          ) : null}
          <label htmlFor="preview-corrective-action" className="block text-sm font-medium text-zinc-900">
            Corrective action required
            <span className="text-zinc-500"> *</span>
          </label>
          <textarea
            id="preview-corrective-action"
            rows={3}
            placeholder="Example: moved food to another cooler and rechecked temperature."
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled
          className="inline-flex min-h-12 min-w-[8rem] items-center justify-center rounded-md border border-zinc-900 bg-zinc-900 px-4 text-sm font-medium text-white opacity-60"
        >
          Submit
        </button>
      </div>
    </div>
  );
}

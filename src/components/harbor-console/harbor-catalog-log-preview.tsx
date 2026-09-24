"use client";

import { useState } from "react";

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
  correctiveActionRequired: boolean;
};

export type HarborCatalogPreviewModel = {
  name: string;
  purposeLabel: string;
  categoryLabel: string;
  cadenceLabel: string;
  instructions: string;
  fields: PreviewField[];
};

function rangeLabel(field: PreviewField): string | null {
  if (field.minNumber === "" && field.maxNumber === "") return null;
  const unit = field.unitLabel.trim();
  if (field.minNumber !== "" && field.maxNumber !== "") {
    return `${field.minNumber}${unit}–${field.maxNumber}${unit}`;
  }
  if (field.minNumber !== "") return `≥ ${field.minNumber}${unit}`;
  return `≤ ${field.maxNumber}${unit}`;
}

function fieldOutOfRange(field: PreviewField, raw: string): boolean {
  if (!field.correctiveActionRequired) return false;
  if (field.fieldType === "TEMPERATURE" || field.fieldType === "NUMBER") {
    const n = Number(raw);
    if (!Number.isFinite(n) || raw.trim() === "") return false;
    if (field.minNumber !== "" && n < Number(field.minNumber)) return true;
    if (field.maxNumber !== "" && n > Number(field.maxNumber)) return true;
  }
  if (field.fieldType === "PASS_NEEDS_ATTENTION") return raw === "NEEDS_ATTENTION";
  if (field.fieldType === "YES_NO") return raw === "NO";
  return false;
}

export function HarborCatalogLogPreview({ model }: { model: HarborCatalogPreviewModel }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const labeledFields = model.fields.filter((field) => field.label.trim().length > 0);
  const outOfStandard = labeledFields.some((field) => fieldOutOfRange(field, values[field.key] ?? ""));

  function setValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

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

      {labeledFields.length === 0 ? (
        <p className="text-sm text-zinc-600">Add a field with a label to preview it.</p>
      ) : (
        <div className="space-y-4">
          {labeledFields.map((field) => {
            const raw = values[field.key] ?? "";
            const oos = fieldOutOfRange(field, raw);
            const expected = rangeLabel(field);
            const fieldId = `preview-${field.key}`;
            return (
              <div key={field.key} className="space-y-1.5">
                <label className="block text-sm font-medium text-zinc-900" htmlFor={fieldId}>
                  {field.label}
                  {field.isRequired ? <span className="text-zinc-500"> *</span> : null}
                </label>
                {field.helpText ? <p className="text-xs text-zinc-500">{field.helpText}</p> : null}
                <PreviewControl field={field} fieldId={fieldId} raw={raw} onChange={setValue} />
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

      {outOfStandard ? (
        <div className="space-y-1.5">
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

function PreviewControl({
  field,
  fieldId,
  raw,
  onChange,
}: {
  field: PreviewField;
  fieldId: string;
  raw: string;
  onChange: (key: string, value: string) => void;
}) {
  if (field.fieldType === "TEMPERATURE" || field.fieldType === "NUMBER") {
    return (
      <div className="flex items-center gap-2">
        <input
          id={fieldId}
          inputMode="decimal"
          value={raw}
          onChange={(event) => onChange(field.key, event.target.value)}
          className="min-h-12 w-32 rounded-md border border-zinc-300 px-3 text-base"
        />
        {field.unitLabel ? <span className="text-sm text-zinc-600">{field.unitLabel}</span> : null}
      </div>
    );
  }

  if (field.fieldType === "YES_NO") {
    return (
      <ChoiceButtons
        options={[
          { value: "YES", label: "Yes" },
          { value: "NO", label: "No" },
        ]}
        raw={raw}
        onPick={(value) => onChange(field.key, value)}
      />
    );
  }

  if (field.fieldType === "PASS_NEEDS_ATTENTION") {
    return (
      <ChoiceButtons
        options={[
          { value: "PASS", label: "Pass" },
          { value: "NEEDS_ATTENTION", label: "Needs attention" },
        ]}
        raw={raw}
        onPick={(value) => onChange(field.key, value)}
      />
    );
  }

  if (field.fieldType === "SINGLE_SELECT") {
    return (
      <select
        id={fieldId}
        value={raw}
        onChange={(event) => onChange(field.key, event.target.value)}
        className="min-h-12 w-full max-w-md rounded-md border border-zinc-300 px-3 text-sm"
      >
        <option value="">Select…</option>
        {field.allowedSelections.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.fieldType === "SHORT_TEXT") {
    return (
      <input
        id={fieldId}
        value={raw}
        onChange={(event) => onChange(field.key, event.target.value)}
        className="min-h-12 w-full max-w-md rounded-md border border-zinc-300 px-3 text-sm"
      />
    );
  }

  return (
    <textarea
      id={fieldId}
      value={raw}
      rows={field.fieldType === "ATTESTATION" ? 2 : 3}
      onChange={(event) => onChange(field.key, event.target.value)}
      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
    />
  );
}

function ChoiceButtons({
  options,
  raw,
  onPick,
}: {
  options: ReadonlyArray<{ value: string; label: string }>;
  raw: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onPick(option.value)}
          className={`min-h-12 min-w-[5.5rem] rounded-md border px-3 text-sm font-medium ${
            raw === option.value
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-300 bg-white text-zinc-800"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

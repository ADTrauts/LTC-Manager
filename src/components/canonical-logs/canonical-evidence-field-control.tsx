"use client";

import { EvidenceSignaturePad } from "@/components/canonical-logs/evidence-signature-pad";
import type { EvidenceMediaInput } from "@/lib/canonical-logs/evidence-media";

export type CanonicalFieldControlModel = {
  fieldKey: string;
  fieldType: string;
  isRequired: boolean;
  unitLabel?: string | null;
  allowedSelections: string[];
};

type Props = {
  field: CanonicalFieldControlModel;
  fieldId: string;
  raw: string;
  selections: string[];
  disabled?: boolean;
  onChange: (next: { raw?: string; selections?: string[]; media?: EvidenceMediaInput | null }) => void;
};

function ChoiceButtons({
  options,
  raw,
  disabled,
  onPick,
}: {
  options: ReadonlyArray<{ value: string; label: string }>;
  raw: string;
  disabled?: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onPick(option.value)}
          className={`min-h-12 min-w-[5.5rem] rounded-md border px-3 text-sm font-medium disabled:opacity-60 ${
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

export function CanonicalEvidenceFieldControl({
  field,
  fieldId,
  raw,
  selections,
  disabled,
  onChange,
}: Props) {
  if (field.fieldType === "TEMPERATURE" || field.fieldType === "NUMBER") {
    return (
      <div className="flex items-center gap-2">
        <input
          id={fieldId}
          inputMode="decimal"
          value={raw}
          disabled={disabled}
          onChange={(event) => onChange({ raw: event.target.value })}
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
        disabled={disabled}
        onPick={(value) => onChange({ raw: value })}
      />
    );
  }

  if (field.fieldType === "COMPLIANCE") {
    return (
      <ChoiceButtons
        options={[
          { value: "COMPLIANT", label: "Compliant" },
          { value: "NON_COMPLIANT", label: "Non-Compliant" },
          { value: "NOT_APPLICABLE", label: "N/A" },
        ]}
        raw={raw}
        disabled={disabled}
        onPick={(value) => onChange({ raw: value })}
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
        disabled={disabled}
        onPick={(value) => onChange({ raw: value })}
      />
    );
  }

  if (field.fieldType === "SINGLE_SELECT") {
    return (
      <select
        id={fieldId}
        value={raw}
        disabled={disabled}
        onChange={(event) => onChange({ raw: event.target.value })}
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

  if (field.fieldType === "MULTI_SELECT") {
    return (
      <div className="space-y-2" data-testid={`multi-select-${field.fieldKey}`}>
        {field.allowedSelections.map((option) => {
          const checked = selections.includes(option);
          return (
            <label key={option} className="flex min-h-10 items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                disabled={disabled}
                checked={checked}
                onChange={() => {
                  const next = checked
                    ? selections.filter((item) => item !== option)
                    : [...selections, option];
                  onChange({ selections: next });
                }}
              />
              {option}
            </label>
          );
        })}
      </div>
    );
  }

  if (field.fieldType === "DATE") {
    return (
      <input
        id={fieldId}
        type="date"
        value={raw}
        disabled={disabled}
        onChange={(event) => onChange({ raw: event.target.value })}
        className="min-h-12 w-full max-w-xs rounded-md border border-zinc-300 px-3 text-sm"
      />
    );
  }

  if (field.fieldType === "TIME") {
    return (
      <input
        id={fieldId}
        type="time"
        value={raw}
        disabled={disabled}
        onChange={(event) => onChange({ raw: event.target.value })}
        className="min-h-12 w-full max-w-xs rounded-md border border-zinc-300 px-3 text-sm"
      />
    );
  }

  if (field.fieldType === "ATTESTATION") {
    return (
      <label className="flex min-h-12 items-center gap-2 text-sm text-zinc-800">
        <input
          id={fieldId}
          type="checkbox"
          disabled={disabled}
          checked={raw === "YES"}
          onChange={(event) => onChange({ raw: event.target.checked ? "YES" : "" })}
        />
        I confirm the above check was completed.
      </label>
    );
  }

  if (field.fieldType === "SHORT_TEXT") {
    return (
      <input
        id={fieldId}
        value={raw}
        disabled={disabled}
        onChange={(event) => onChange({ raw: event.target.value })}
        className="min-h-12 w-full max-w-md rounded-md border border-zinc-300 px-3 text-sm"
      />
    );
  }

  if (field.fieldType === "PHOTO" || field.fieldType === "FILE" || field.fieldType === "SIGNATURE") {
    if (field.fieldType === "SIGNATURE") {
      return (
        <EvidenceSignaturePad
          disabled={disabled}
          onChange={(dataUrl) => {
            if (!dataUrl) {
              onChange({ media: null });
              return;
            }
            onChange({
              media: {
                fieldKey: field.fieldKey,
                kind: "SIGNATURE",
                filename: "signature.png",
                contentType: "image/png",
                dataBase64: dataUrl.split(",")[1] ?? "",
              },
            });
          }}
        />
      );
    }
    return (
      <input
        id={fieldId}
        type="file"
        accept={
          field.fieldType === "PHOTO"
            ? "image/jpeg,image/png,image/webp,image/gif"
            : ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.docx,.xlsx,application/pdf,text/plain,text/csv"
        }
        capture={field.fieldType === "PHOTO" ? "environment" : undefined}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            onChange({ media: null });
            return;
          }
          if (file.size > 4 * 1024 * 1024) {
            onChange({ media: null });
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const rawResult = String(reader.result ?? "");
            onChange({
              media: {
                fieldKey: field.fieldKey,
                kind: field.fieldType === "PHOTO" ? "PHOTO" : "FILE",
                filename: file.name,
                contentType: file.type || "application/octet-stream",
                dataBase64: rawResult.includes(",") ? rawResult.split(",")[1] ?? "" : rawResult,
              },
            });
          };
          reader.readAsDataURL(file);
        }}
      />
    );
  }

  return (
    <textarea
      id={fieldId}
      value={raw}
      disabled={disabled}
      rows={field.fieldType === "OPTIONAL_COMMENT" ? 3 : 4}
      onChange={(event) => onChange({ raw: event.target.value })}
      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
    />
  );
}

export function fieldOutOfStandardFromRaw(
  field: {
    fieldType: string;
    minNumber?: number | null;
    maxNumber?: number | null;
    correctiveActionTrigger?: boolean;
  },
  raw: string,
): boolean {
  if (!field.correctiveActionTrigger) return false;
  if (field.fieldType === "TEMPERATURE" || field.fieldType === "NUMBER") {
    const n = Number(raw);
    if (!Number.isFinite(n) || raw.trim() === "") return false;
    if (field.minNumber != null && n < field.minNumber) return true;
    if (field.maxNumber != null && n > field.maxNumber) return true;
  }
  if (field.fieldType === "COMPLIANCE") return raw === "NON_COMPLIANT";
  if (field.fieldType === "PASS_NEEDS_ATTENTION") return raw === "NEEDS_ATTENTION";
  if (field.fieldType === "YES_NO") return raw === "NO";
  return false;
}

export function expectedRangeLabel(field: {
  minNumber?: number | null | string;
  maxNumber?: number | null | string;
  unitLabel?: string | null;
}): string | null {
  const min =
    field.minNumber === "" || field.minNumber == null ? null : Number(field.minNumber);
  const max =
    field.maxNumber === "" || field.maxNumber == null ? null : Number(field.maxNumber);
  if (min == null && max == null) return null;
  if ((min != null && !Number.isFinite(min)) || (max != null && !Number.isFinite(max))) return null;
  const unit = field.unitLabel?.trim() ?? "";
  if (min != null && max != null) return `${min}${unit}–${max}${unit}`;
  if (min != null) return `≥ ${min}${unit}`;
  return `≤ ${max}${unit}`;
}

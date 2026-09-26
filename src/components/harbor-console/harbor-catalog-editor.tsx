"use client";

import { useRef, useState } from "react";

import type { CatalogActionResult } from "@/app/console/(staff)/catalog/actions";
import { Drawer } from "@/components/drawer";
import {
  HarborCatalogLogPreview,
  type HarborCatalogPreviewModel,
} from "@/components/harbor-console/harbor-catalog-log-preview";
import type { HarborCatalogField } from "@/lib/harbor-console/catalog";

const FIELD_TYPES = [
  { value: "TEMPERATURE", label: "Temperature" },
  { value: "NUMBER", label: "Number" },
  { value: "SHORT_TEXT", label: "Short text" },
  { value: "YES_NO", label: "Yes / No" },
  { value: "PASS_NEEDS_ATTENTION", label: "Pass / Needs attention" },
  { value: "SINGLE_SELECT", label: "Single select" },
  { value: "ATTESTATION", label: "Attestation" },
  { value: "OPTIONAL_COMMENT", label: "Comment" },
] as const;

const CATEGORIES = [
  { value: "TEMPERATURE", label: "Temperature" },
  { value: "SANITATION", label: "Sanitation" },
  { value: "CLEANING", label: "Cleaning" },
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "FOOD_SAFETY", label: "Food safety" },
  { value: "OPENING_CLOSING", label: "Opening / closing" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "OTHER", label: "Other" },
] as const;

const CADENCES = [
  { value: "ONCE_DAILY", label: "Once daily" },
  { value: "TWICE_DAILY", label: "Twice daily" },
  { value: "THREE_TIMES_DAILY", label: "Three times daily" },
  { value: "ONCE_PER_OPERATIONAL_CYCLE", label: "Each operational cycle" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "AD_HOC", label: "As needed" },
] as const;

type EditorField = {
  key: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  helpText: string;
  unitLabel: string;
  minNumber: string;
  maxNumber: string;
  allowedSelections: string;
  correctiveActionRequired: boolean;
};

function toEditorField(field: HarborCatalogField, index: number): EditorField {
  return {
    key: field.id || `new-${index}`,
    label: field.label,
    fieldType: field.fieldType,
    isRequired: field.isRequired,
    helpText: field.helpText ?? "",
    unitLabel: field.unitLabel ?? "",
    minNumber: field.minNumber == null ? "" : String(field.minNumber),
    maxNumber: field.maxNumber == null ? "" : String(field.maxNumber),
    allowedSelections: field.allowedSelections.join(", "),
    correctiveActionRequired: field.correctiveActionRequired,
  };
}

function emptyField(): EditorField {
  return {
    key: `new-${Date.now()}`,
    label: "",
    fieldType: "TEMPERATURE",
    isRequired: true,
    helpText: "",
    unitLabel: "°F",
    minNumber: "",
    maxNumber: "",
    allowedSelections: "",
    correctiveActionRequired: false,
  };
}

function labelFor(options: ReadonlyArray<{ value: string; label: string }>, value: string) {
  return options.find((item) => item.value === value)?.label ?? value;
}

function previewModelFromForm(form: HTMLFormElement, fields: EditorField[]): HarborCatalogPreviewModel {
  const data = new FormData(form);
  return {
    name: String(data.get("name") ?? ""),
    purposeLabel: labelFor(
      [
        { value: "LOG", label: "Log" },
        { value: "CHECKLIST", label: "Checklist" },
      ],
      String(data.get("purposeType") ?? "LOG"),
    ),
    categoryLabel: labelFor(CATEGORIES, String(data.get("category") ?? "OTHER")),
    cadenceLabel: labelFor(CADENCES, String(data.get("recommendedCadence") ?? "AD_HOC")),
    instructions: String(data.get("instructions") ?? ""),
    fields: fields.map((field) => ({
      key: field.key,
      label: field.label,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      helpText: field.helpText,
      unitLabel: field.unitLabel,
      minNumber: field.minNumber,
      maxNumber: field.maxNumber,
      allowedSelections: field.allowedSelections
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
      correctiveActionRequired: field.correctiveActionRequired,
    })),
  };
}

function serializeFields(fields: EditorField[]) {
  return JSON.stringify(
    fields
      .filter((field) => field.label.trim().length > 0)
      .map((field) => ({
        label: field.label.trim(),
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        helpText: field.helpText.trim() || null,
        unitLabel: field.unitLabel.trim() || null,
        minNumber: field.minNumber === "" ? null : Number(field.minNumber),
        maxNumber: field.maxNumber === "" ? null : Number(field.maxNumber),
        allowedSelections: field.allowedSelections
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
        correctiveActionTrigger: field.correctiveActionRequired,
        correctiveActionRequired: field.correctiveActionRequired,
      })),
  );
}

const inputClass =
  "w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm outline-none ring-[var(--brand-accent)] focus:ring-2";

export function HarborCatalogEditor({
  mode,
  stableKey,
  definitionId,
  initialName,
  initialDescription,
  initialInstructions,
  initialPurposeType,
  initialCategory,
  initialCadence,
  initialFields,
  primaryAction,
  secondaryAction,
}: {
  mode: "create" | "draft";
  stableKey?: string;
  definitionId?: string;
  initialName?: string;
  initialDescription?: string;
  initialInstructions?: string;
  initialPurposeType?: string;
  initialCategory?: string;
  initialCadence?: string | null;
  initialFields?: HarborCatalogField[];
  primaryAction: (formData: FormData) => Promise<CatalogActionResult | void>;
  secondaryAction?: (formData: FormData) => Promise<CatalogActionResult | void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fields, setFields] = useState<EditorField[]>(
    initialFields && initialFields.length > 0 ? initialFields.map(toEditorField) : [emptyField()],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"primary" | "secondary" | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<HarborCatalogPreviewModel | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  async function run(
    action: (formData: FormData) => Promise<CatalogActionResult | void>,
    formData: FormData,
    which: "primary" | "secondary",
  ) {
    setPending(which);
    setError(null);
    formData.set("fieldsJson", serializeFields(fields));
    const result = await action(formData);
    setPending(null);
    if (result && result.ok === false) {
      setError(result.error);
    }
  }

  function openPreview() {
    const form = formRef.current;
    if (!form) return;
    setPreview(previewModelFromForm(form, fields));
    setPreviewKey((current) => current + 1);
    setPreviewOpen(true);
  }

  return (
    <form
      ref={formRef}
      className="space-y-5"
      action={async (formData) => run(primaryAction, formData, "primary")}
    >
      {definitionId ? <input type="hidden" name="definitionId" value={definitionId} /> : null}
      {stableKey ? <input type="hidden" name="stableKey" value={stableKey} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Name</span>
          <input name="name" required defaultValue={initialName} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Purpose</span>
          <select name="purposeType" defaultValue={initialPurposeType ?? "LOG"} className={inputClass}>
            <option value="LOG">Log</option>
            <option value="CHECKLIST">Checklist</option>
            <option value="INSPECTION">Inspection</option>
            <option value="PROCEDURE">Procedure</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Category</span>
          <select name="category" defaultValue={initialCategory ?? "OTHER"} className={inputClass}>
            {CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Recommended cadence</span>
          <select name="recommendedCadence" defaultValue={initialCadence ?? "AD_HOC"} className={inputClass}>
            {CADENCES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Description</span>
          <textarea name="description" rows={2} defaultValue={initialDescription} className={inputClass} />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Instructions for staff</span>
          <textarea name="instructions" rows={3} defaultValue={initialInstructions} className={inputClass} />
        </label>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Fields</h2>
          <button
            type="button"
            className="text-sm font-medium text-[var(--text-secondary)] underline-offset-2 hover:underline"
            onClick={() => setFields((current) => [...current, emptyField()])}
          >
            Add field
          </button>
        </div>
        <ul className="space-y-3">
          {fields.map((field, index) => (
            <li key={field.key} className="rounded-md border border-[var(--border)] bg-white p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs text-[var(--text-secondary)]">Label</span>
                  <input
                    value={field.label}
                    onChange={(event) =>
                      setFields((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, label: event.target.value } : row,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-[var(--text-secondary)]">Type</span>
                  <select
                    value={field.fieldType}
                    onChange={(event) =>
                      setFields((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, fieldType: event.target.value } : row,
                        ),
                      )
                    }
                    className={inputClass}
                  >
                    {FIELD_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-[var(--text-secondary)]">Unit</span>
                  <input
                    value={field.unitLabel}
                    onChange={(event) =>
                      setFields((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, unitLabel: event.target.value } : row,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="text-xs text-[var(--text-secondary)]">Min</span>
                    <input
                      value={field.minNumber}
                      onChange={(event) =>
                        setFields((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, minNumber: event.target.value } : row,
                          ),
                        )
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-[var(--text-secondary)]">Max</span>
                    <input
                      value={field.maxNumber}
                      onChange={(event) =>
                        setFields((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, maxNumber: event.target.value } : row,
                          ),
                        )
                      }
                      className={inputClass}
                    />
                  </label>
                </div>
                {field.fieldType === "SINGLE_SELECT" ? (
                  <label className="block space-y-1 sm:col-span-2">
                    <span className="text-xs text-[var(--text-secondary)]">Choices (comma-separated)</span>
                    <input
                      value={field.allowedSelections}
                      onChange={(event) =>
                        setFields((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, allowedSelections: event.target.value } : row,
                          ),
                        )
                      }
                      className={inputClass}
                    />
                  </label>
                ) : null}
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-xs text-[var(--text-secondary)]">Help</span>
                  <input
                    value={field.helpText}
                    onChange={(event) =>
                      setFields((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, helpText: event.target.value } : row,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={field.isRequired}
                    onChange={(event) =>
                      setFields((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, isRequired: event.target.checked } : row,
                        ),
                      )
                    }
                  />
                  Required
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={field.correctiveActionRequired}
                    onChange={(event) =>
                      setFields((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index
                            ? { ...row, correctiveActionRequired: event.target.checked }
                            : row,
                        ),
                      )
                    }
                  />
                  Corrective action
                </label>
                {fields.length > 1 ? (
                  <button
                    type="button"
                    className="ml-auto text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline"
                    onClick={() => setFields((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending !== null}
          onClick={openPreview}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold disabled:opacity-60"
          data-testid="harbor-catalog-preview-button"
        >
          Preview
        </button>
        <button
          type="submit"
          disabled={pending !== null}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)] disabled:opacity-60"
        >
          {pending === "primary"
            ? "Saving…"
            : mode === "create"
              ? "Create draft"
              : "Save draft"}
        </button>
        {secondaryAction ? (
          <button
            type="submit"
            disabled={pending !== null}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold disabled:opacity-60"
            formAction={async (formData) => run(secondaryAction, formData, "secondary")}
          >
            {pending === "secondary" ? "Publishing…" : "Publish"}
          </button>
        ) : null}
      </div>
      <Drawer
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Preview"
        closeLabel="Close"
        size="md"
        data-testid="harbor-catalog-preview"
      >
        {preview ? <HarborCatalogLogPreview key={previewKey} model={preview} /> : null}
      </Drawer>
    </form>
  );
}

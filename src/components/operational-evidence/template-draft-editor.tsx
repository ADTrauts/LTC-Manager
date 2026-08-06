"use client";

import { useMemo, useState } from "react";

import type {
  TemplateApplicabilityDraftInput,
  TemplateDraftInput,
  TemplateFieldDraftInput,
  TemplateScheduleDraftInput,
  TemplateValidationResult,
} from "@/lib/operational-evidence/types";
import { validateTemplate, validateTemplateForPublish } from "@/lib/operational-evidence/validate-template";

const FIELD_TYPES = [
  { value: "SHORT_TEXT", label: "Short text" },
  { value: "LONG_TEXT", label: "Long text" },
  { value: "NUMBER", label: "Number" },
  { value: "TEMPERATURE", label: "Temperature" },
  { value: "YES_NO", label: "Yes / No" },
  { value: "PASS_NEEDS_ATTENTION", label: "Pass / Needs Attention" },
  { value: "SINGLE_SELECT", label: "Single select" },
  { value: "MULTI_SELECT", label: "Multi-select" },
  { value: "DATE", label: "Date" },
  { value: "TIME", label: "Time" },
  { value: "ATTESTATION", label: "Attestation" },
  { value: "OPTIONAL_COMMENT", label: "Optional comment" },
] as const;

const SPACE_TYPES = [
  "SERVICE_AREA",
  "PATIENT_ROOM",
  "PRODUCTION_AREA",
  "STORAGE",
  "UTILITY",
  "OFFICE",
  "RESTROOM",
  "MECHANICAL",
  "PUBLIC_AREA",
  "OTHER",
] as const;

const APPLICABILITY_KINDS = [
  { value: "SPECIFIC_ASSET", label: "Specific Asset" },
  { value: "ASSET_TYPE", label: "Asset type" },
  { value: "SPECIFIC_SPACE", label: "Specific Space" },
  { value: "SPACE_TYPE", label: "Space type" },
  { value: "DEPARTMENT_UNIT", label: "Unit / Department location" },
] as const;

const SCHEDULE_KINDS = [
  { value: "OPERATIONAL_CYCLE", label: "Operational Cycle" },
  { value: "FIXED_DAILY_WINDOW", label: "Fixed Facility-local window" },
  { value: "ONCE_PER_OPERATIONAL_DATE", label: "Once per operational date" },
  { value: "AD_HOC", label: "Ad-hoc schedule row" },
] as const;

export type BuilderAssetOption = {
  id: string;
  name: string;
  assetCode: string;
  equipmentType: string;
  unitId: string;
};

export type BuilderSpaceOption = {
  id: string;
  name: string;
  spaceType: string;
  unitId: string | null;
};

export type BuilderUnitOption = {
  id: string;
  name: string;
  unitType: string;
};

export type BuilderCycleOption = {
  stableKey: string;
  label: string;
  version: number;
};

export type TemplateEditorModel = TemplateDraftInput & {
  id?: string;
  status?: string;
  version?: number;
  stableKey?: string;
};

type Props = {
  mode: "create" | "edit" | "readonly" | "preview";
  initial: TemplateEditorModel;
  assets: BuilderAssetOption[];
  spaces: BuilderSpaceOption[];
  units: BuilderUnitOption[];
  cycleOptions: BuilderCycleOption[];
  assetTypes: string[];
  disabled?: boolean;
  pending?: boolean;
  onSave?: (draft: TemplateDraftInput) => void;
  onPublish?: (draft: TemplateDraftInput) => void;
  onCancel?: () => void;
  testId?: string;
};

function emptyField(seq: number): TemplateFieldDraftInput {
  return {
    fieldKey: `field_${seq}`,
    label: "",
    fieldType: "SHORT_TEXT",
    isRequired: true,
    displaySequence: seq * 10,
    helpText: null,
    unitLabel: null,
    minNumber: null,
    maxNumber: null,
    allowedSelections: [],
    correctiveActionTrigger: false,
    correctiveActionRequired: false,
  };
}

function resequence(fields: TemplateFieldDraftInput[]): TemplateFieldDraftInput[] {
  return fields.map((f, i) => ({ ...f, displaySequence: (i + 1) * 10 }));
}

function rangeApplicable(fieldType: string) {
  return fieldType === "NUMBER" || fieldType === "TEMPERATURE";
}

function selectApplicable(fieldType: string) {
  return fieldType === "SINGLE_SELECT" || fieldType === "MULTI_SELECT";
}

export function TemplateDraftEditor({
  mode,
  initial,
  assets,
  spaces,
  units,
  cycleOptions,
  assetTypes,
  disabled = false,
  pending = false,
  onSave,
  onPublish,
  onCancel,
  testId = "template-draft-editor",
}: Props) {
  const readOnly = mode === "readonly" || mode === "preview" || disabled;
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [instructions, setInstructions] = useState(initial.instructions ?? "");
  const [purposeType, setPurposeType] = useState(initial.purposeType);
  const [allowAdHoc, setAllowAdHoc] = useState(initial.allowAdHoc ?? false);
  const [fields, setFields] = useState<TemplateFieldDraftInput[]>(
    initial.fields.length > 0 ? initial.fields : [emptyField(1)],
  );
  const [applicabilities, setApplicabilities] = useState<TemplateApplicabilityDraftInput[]>(
    initial.applicabilities ?? [],
  );
  const [schedules, setSchedules] = useState<TemplateScheduleDraftInput[]>(
    initial.schedules ?? [],
  );
  const [previewDate, setPreviewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [previewUnitId, setPreviewUnitId] = useState(units[0]?.id ?? "");
  const [showPreview, setShowPreview] = useState(mode === "preview");

  const draft: TemplateDraftInput = useMemo(
    () => ({
      name,
      description: description || null,
      instructions: instructions || null,
      purposeType,
      allowAdHoc,
      presetKey: initial.presetKey ?? null,
      stableKey: initial.stableKey,
      fields: resequence(fields),
      applicabilities,
      schedules,
    }),
    [
      name,
      description,
      instructions,
      purposeType,
      allowAdHoc,
      initial.presetKey,
      initial.stableKey,
      fields,
      applicabilities,
      schedules,
    ],
  );

  const validation: TemplateValidationResult = useMemo(() => validateTemplate(draft), [draft]);
  const publishValidation: TemplateValidationResult = useMemo(
    () => validateTemplateForPublish(draft),
    [draft],
  );

  const previewAssets = useMemo(() => {
    const unitAssets = assets.filter((a) => !previewUnitId || a.unitId === previewUnitId);
    const matched = new Map<string, BuilderAssetOption>();
    for (const row of applicabilities) {
      if (row.kind === "SPECIFIC_ASSET" && row.assetId) {
        const asset = assets.find((a) => a.id === row.assetId);
        if (asset) matched.set(asset.id, asset);
      }
      if (row.kind === "ASSET_TYPE" && row.assetType) {
        for (const asset of unitAssets.filter((a) => a.equipmentType === row.assetType)) {
          matched.set(asset.id, asset);
        }
      }
    }
    return Array.from(matched.values());
  }, [applicabilities, assets, previewUnitId]);

  const previewSpaces = useMemo(() => {
    const matched = new Map<string, BuilderSpaceOption>();
    for (const row of applicabilities) {
      if (row.kind === "SPECIFIC_SPACE" && row.spaceId) {
        const space = spaces.find((s) => s.id === row.spaceId);
        if (space) matched.set(space.id, space);
      }
      if (row.kind === "SPACE_TYPE" && row.spaceType) {
        for (const space of spaces.filter(
          (s) => s.spaceType === row.spaceType && (!previewUnitId || s.unitId === previewUnitId),
        )) {
          matched.set(space.id, space);
        }
      }
    }
    return Array.from(matched.values());
  }, [applicabilities, spaces, previewUnitId]);

  function updateField(index: number, patch: Partial<TemplateFieldDraftInput>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function moveField(index: number, delta: number) {
    setFields((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return resequence(next);
    });
  }

  return (
    <div className="space-y-4" data-testid={testId} data-editor-mode={mode}>
      <section className="grid gap-3 sm:grid-cols-2" data-testid="template-metadata-editor">
        <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
          Name
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            value={name}
            disabled={readOnly || pending}
            onChange={(e) => setName(e.target.value)}
            data-testid="template-name-input"
          />
        </label>
        <label className="block text-xs font-medium text-zinc-700">
          Purpose
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            value={purposeType}
            disabled={readOnly || pending}
            onChange={(e) =>
              setPurposeType(e.target.value as TemplateDraftInput["purposeType"])
            }
            data-testid="template-purpose-select"
          >
            <option value="LOG">Log</option>
            <option value="CHECKLIST">Checklist</option>
            <option value="INSPECTION">Inspection</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
          <input
            type="checkbox"
            checked={allowAdHoc}
            disabled={readOnly || pending}
            onChange={(e) => setAllowAdHoc(e.target.checked)}
            data-testid="template-allow-adhoc"
          />
          Allow ad-hoc records
        </label>
        <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
          Description
          <textarea
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            rows={2}
            value={description}
            disabled={readOnly || pending}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="template-description-input"
          />
        </label>
        <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
          Instructions
          <textarea
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            rows={2}
            value={instructions}
            disabled={readOnly || pending}
            onChange={(e) => setInstructions(e.target.value)}
            data-testid="template-instructions-input"
          />
        </label>
      </section>

      <section className="space-y-2" data-testid="template-field-editor">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">Fields</h3>
          {!readOnly ? (
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
              disabled={pending}
              data-testid="template-add-field"
              onClick={() => setFields((prev) => [...prev, emptyField(prev.length + 1)])}
            >
              Add field
            </button>
          ) : null}
        </div>
        <ul className="space-y-3">
          {fields.map((field, index) => (
            <li
              key={`${field.fieldKey}-${index}`}
              className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
              data-testid={`template-field-row-${index}`}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs font-medium text-zinc-700">
                  Label
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={field.label}
                    disabled={readOnly || pending}
                    onChange={(e) => updateField(index, { label: e.target.value })}
                    data-testid={`template-field-label-${index}`}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-700">
                  Type
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={field.fieldType}
                    disabled={readOnly || pending}
                    onChange={(e) =>
                      updateField(index, {
                        fieldType: e.target.value as TemplateFieldDraftInput["fieldType"],
                        isRequired: e.target.value === "OPTIONAL_COMMENT" ? false : field.isRequired,
                      })
                    }
                    data-testid={`template-field-type-${index}`}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
                  Help text
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={field.helpText ?? ""}
                    disabled={readOnly || pending}
                    onChange={(e) => updateField(index, { helpText: e.target.value || null })}
                    data-testid={`template-field-help-${index}`}
                  />
                </label>
                {rangeApplicable(field.fieldType) ? (
                  <>
                    <label className="block text-xs font-medium text-zinc-700">
                      Units
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                        value={field.unitLabel ?? ""}
                        disabled={readOnly || pending}
                        onChange={(e) => updateField(index, { unitLabel: e.target.value || null })}
                        data-testid={`template-field-units-${index}`}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-xs font-medium text-zinc-700">
                        Minimum
                        <input
                          type="number"
                          step="any"
                          className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                          value={field.minNumber ?? ""}
                          disabled={readOnly || pending}
                          onChange={(e) =>
                            updateField(index, {
                              minNumber: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          data-testid={`template-field-min-${index}`}
                        />
                      </label>
                      <label className="block text-xs font-medium text-zinc-700">
                        Maximum
                        <input
                          type="number"
                          step="any"
                          className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                          value={field.maxNumber ?? ""}
                          disabled={readOnly || pending}
                          onChange={(e) =>
                            updateField(index, {
                              maxNumber: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          data-testid={`template-field-max-${index}`}
                        />
                      </label>
                    </div>
                  </>
                ) : null}
                {selectApplicable(field.fieldType) ? (
                  <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
                    Choices (comma-separated)
                    <input
                      className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      value={(field.allowedSelections ?? []).join(", ")}
                      disabled={readOnly || pending}
                      onChange={(e) =>
                        updateField(index, {
                          allowedSelections: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      data-testid={`template-field-choices-${index}`}
                    />
                  </label>
                ) : null}
                <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={field.fieldType === "OPTIONAL_COMMENT" ? false : Boolean(field.isRequired)}
                    disabled={readOnly || pending || field.fieldType === "OPTIONAL_COMMENT"}
                    onChange={(e) => updateField(index, { isRequired: e.target.checked })}
                    data-testid={`template-field-required-${index}`}
                  />
                  Required
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={Boolean(field.correctiveActionTrigger)}
                    disabled={readOnly || pending}
                    onChange={(e) =>
                      updateField(index, {
                        correctiveActionTrigger: e.target.checked,
                        correctiveActionRequired: e.target.checked
                          ? field.correctiveActionRequired
                          : false,
                      })
                    }
                    data-testid={`template-field-ca-trigger-${index}`}
                  />
                  Corrective-action trigger
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={Boolean(field.correctiveActionRequired)}
                    disabled={readOnly || pending || !field.correctiveActionTrigger}
                    onChange={(e) =>
                      updateField(index, { correctiveActionRequired: e.target.checked })
                    }
                    data-testid={`template-field-ca-required-${index}`}
                  />
                  Corrective action required
                </label>
              </div>
              {!readOnly ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-zinc-300 px-2 py-1 text-xs"
                    disabled={pending || index === 0}
                    onClick={() => moveField(index, -1)}
                    data-testid={`template-field-move-up-${index}`}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    className="rounded border border-zinc-300 px-2 py-1 text-xs"
                    disabled={pending || index === fields.length - 1}
                    onClick={() => moveField(index, 1)}
                    data-testid={`template-field-move-down-${index}`}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-800"
                    disabled={pending || fields.length <= 1}
                    onClick={() =>
                      setFields((prev) => resequence(prev.filter((_, i) => i !== index)))
                    }
                    data-testid={`template-field-remove-${index}`}
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2" data-testid="template-applicability-editor">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">Applicability</h3>
          {!readOnly ? (
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
              disabled={pending}
              data-testid="template-add-applicability"
              onClick={() =>
                setApplicabilities((prev) => [
                  ...prev,
                  { kind: "SPECIFIC_ASSET", assetId: assets[0]?.id ?? "" },
                ])
              }
            >
              Add applicability
            </button>
          ) : null}
        </div>
        {applicabilities.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No applicability rows — publish will warn that requirements are department-scoped.
          </p>
        ) : null}
        <ul className="space-y-2">
          {applicabilities.map((row, index) => (
            <li
              key={index}
              className="grid gap-2 rounded-md border border-zinc-200 bg-white p-3 sm:grid-cols-3"
              data-testid={`template-applicability-row-${index}`}
            >
              <label className="block text-xs font-medium text-zinc-700">
                Kind
                <select
                  className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  value={row.kind}
                  disabled={readOnly || pending}
                  onChange={(e) => {
                    const kind = e.target
                      .value as TemplateApplicabilityDraftInput["kind"];
                    setApplicabilities((prev) =>
                      prev.map((r, i) =>
                        i === index
                          ? {
                              kind,
                              assetId: kind === "SPECIFIC_ASSET" ? assets[0]?.id ?? "" : null,
                              assetType: kind === "ASSET_TYPE" ? assetTypes[0] ?? "" : null,
                              spaceId: kind === "SPECIFIC_SPACE" ? spaces[0]?.id ?? "" : null,
                              spaceType: kind === "SPACE_TYPE" ? "STORAGE" : null,
                              unitId: kind === "DEPARTMENT_UNIT" ? units[0]?.id ?? "" : null,
                            }
                          : r,
                      ),
                    );
                  }}
                  data-testid={`template-applicability-kind-${index}`}
                >
                  {APPLICABILITY_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              {row.kind === "SPECIFIC_ASSET" ? (
                <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
                  Asset
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={row.assetId ?? ""}
                    disabled={readOnly || pending}
                    onChange={(e) =>
                      setApplicabilities((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, assetId: e.target.value } : r,
                        ),
                      )
                    }
                    data-testid={`template-applicability-asset-${index}`}
                  >
                    <option value="">Select asset…</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.assetCode}) · {a.equipmentType}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {row.kind === "ASSET_TYPE" ? (
                <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
                  Asset type
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={row.assetType ?? ""}
                    disabled={readOnly || pending}
                    onChange={(e) =>
                      setApplicabilities((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, assetType: e.target.value } : r,
                        ),
                      )
                    }
                    data-testid={`template-applicability-asset-type-${index}`}
                  >
                    <option value="">Select type…</option>
                    {assetTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {row.kind === "SPECIFIC_SPACE" ? (
                <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
                  Space
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={row.spaceId ?? ""}
                    disabled={readOnly || pending}
                    onChange={(e) =>
                      setApplicabilities((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, spaceId: e.target.value } : r,
                        ),
                      )
                    }
                    data-testid={`template-applicability-space-${index}`}
                  >
                    <option value="">Select space…</option>
                    {spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.spaceType}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {row.kind === "SPACE_TYPE" ? (
                <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
                  Space type
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={row.spaceType ?? ""}
                    disabled={readOnly || pending}
                    onChange={(e) =>
                      setApplicabilities((prev) =>
                        prev.map((r, i) =>
                          i === index
                            ? {
                                ...r,
                                spaceType: e.target
                                  .value as TemplateApplicabilityDraftInput["spaceType"],
                              }
                            : r,
                        ),
                      )
                    }
                    data-testid={`template-applicability-space-type-${index}`}
                  >
                    {SPACE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {row.kind === "DEPARTMENT_UNIT" ? (
                <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
                  Unit
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={row.unitId ?? ""}
                    disabled={readOnly || pending}
                    onChange={(e) =>
                      setApplicabilities((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, unitId: e.target.value } : r,
                        ),
                      )
                    }
                    data-testid={`template-applicability-unit-${index}`}
                  >
                    <option value="">Select unit…</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.unitType}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {!readOnly ? (
                <button
                  type="button"
                  className="justify-self-start rounded border border-red-200 px-2 py-1 text-xs text-red-800"
                  disabled={pending}
                  onClick={() =>
                    setApplicabilities((prev) => prev.filter((_, i) => i !== index))
                  }
                  data-testid={`template-applicability-remove-${index}`}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2" data-testid="template-schedule-editor">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">Scheduling</h3>
          {!readOnly ? (
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
              disabled={pending}
              data-testid="template-add-schedule"
              onClick={() =>
                setSchedules((prev) => [
                  ...prev,
                  {
                    kind: "OPERATIONAL_CYCLE",
                    cycleStableKey: cycleOptions[0]?.stableKey ?? "",
                  },
                ])
              }
            >
              Add schedule
            </button>
          ) : null}
        </div>
        {cycleOptions.length === 0 ? (
          <p className="text-xs text-amber-800">
            No published Operational Cycles yet — publish cycles first, or use a fixed window /
            once-per-date / ad-hoc.
          </p>
        ) : null}
        <ul className="space-y-2">
          {schedules.map((row, index) => (
            <li
              key={index}
              className="grid gap-2 rounded-md border border-zinc-200 bg-white p-3 sm:grid-cols-3"
              data-testid={`template-schedule-row-${index}`}
            >
              <label className="block text-xs font-medium text-zinc-700">
                Kind
                <select
                  className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  value={row.kind}
                  disabled={readOnly || pending}
                  onChange={(e) => {
                    const kind = e.target.value as TemplateScheduleDraftInput["kind"];
                    setSchedules((prev) =>
                      prev.map((r, i) =>
                        i === index
                          ? {
                              kind,
                              cycleStableKey:
                                kind === "OPERATIONAL_CYCLE"
                                  ? cycleOptions[0]?.stableKey ?? ""
                                  : null,
                              windowStartLocal: kind === "FIXED_DAILY_WINDOW" ? "06:00" : null,
                              windowEndLocal: kind === "FIXED_DAILY_WINDOW" ? "10:00" : null,
                            }
                          : r,
                      ),
                    );
                  }}
                  data-testid={`template-schedule-kind-${index}`}
                >
                  {SCHEDULE_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              {row.kind === "OPERATIONAL_CYCLE" ? (
                <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
                  Cycle (reference only — times owned by Cycles)
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={row.cycleStableKey ?? ""}
                    disabled={readOnly || pending}
                    onChange={(e) =>
                      setSchedules((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, cycleStableKey: e.target.value } : r,
                        ),
                      )
                    }
                    data-testid={`template-schedule-cycle-${index}`}
                  >
                    <option value="">Select published cycle…</option>
                    {cycleOptions.map((c) => (
                      <option key={c.stableKey} value={c.stableKey}>
                        {c.label} ({c.stableKey}) v{c.version}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {row.kind === "FIXED_DAILY_WINDOW" ? (
                <>
                  <label className="block text-xs font-medium text-zinc-700">
                    Window start (HH:mm)
                    <input
                      className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      pattern="\d{1,2}:\d{2}"
                      value={row.windowStartLocal ?? ""}
                      disabled={readOnly || pending}
                      onChange={(e) =>
                        setSchedules((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, windowStartLocal: e.target.value } : r,
                          ),
                        )
                      }
                      data-testid={`template-schedule-window-start-${index}`}
                    />
                  </label>
                  <label className="block text-xs font-medium text-zinc-700">
                    Window end (HH:mm)
                    <input
                      className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      pattern="\d{1,2}:\d{2}"
                      value={row.windowEndLocal ?? ""}
                      disabled={readOnly || pending}
                      onChange={(e) =>
                        setSchedules((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, windowEndLocal: e.target.value } : r,
                          ),
                        )
                      }
                      data-testid={`template-schedule-window-end-${index}`}
                    />
                  </label>
                </>
              ) : null}
              {!readOnly ? (
                <button
                  type="button"
                  className="justify-self-start rounded border border-red-200 px-2 py-1 text-xs text-red-800"
                  disabled={pending}
                  onClick={() => setSchedules((prev) => prev.filter((_, i) => i !== index))}
                  data-testid={`template-schedule-remove-${index}`}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3" data-testid="template-preview">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">Draft preview</h3>
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
            onClick={() => setShowPreview((v) => !v)}
            data-testid="template-toggle-preview"
          >
            {showPreview ? "Hide preview" : "Show preview"}
          </button>
        </div>
        {showPreview ? (
          <div className="space-y-2 text-xs text-zinc-700" data-testid="template-preview-body">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block font-medium">
                Operational date
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5"
                  value={previewDate}
                  onChange={(e) => setPreviewDate(e.target.value)}
                  data-testid="template-preview-date"
                />
              </label>
              <label className="block font-medium">
                Unit / Space context
                <select
                  className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5"
                  value={previewUnitId}
                  onChange={(e) => setPreviewUnitId(e.target.value)}
                  data-testid="template-preview-unit"
                >
                  <option value="">All units</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p>
              <span className="font-semibold">{draft.name || "(unnamed)"}</span> · {draft.purposeType}
              {draft.allowAdHoc ? " · ad-hoc allowed" : ""}
            </p>
            <p>Schedules: {draft.schedules?.length ? draft.schedules.map((s) => s.kind).join(", ") : "none"}</p>
            <p>
              Affected assets:{" "}
              {previewAssets.length
                ? previewAssets.map((a) => a.name).join(", ")
                : "none matched for preview unit"}
            </p>
            <p>
              Affected spaces:{" "}
              {previewSpaces.length
                ? previewSpaces.map((s) => s.name).join(", ")
                : "none matched for preview unit"}
            </p>
            <ol className="list-decimal space-y-1 pl-4">
              {draft.fields.map((f) => (
                <li key={f.fieldKey}>
                  {f.label || "(blank)"} · {f.fieldType}
                  {f.isRequired ? " · required" : ""}
                  {rangeApplicable(f.fieldType) && (f.minNumber != null || f.maxNumber != null)
                    ? ` · range ${f.minNumber ?? "—"}–${f.maxNumber ?? "—"} ${f.unitLabel ?? ""}`
                    : ""}
                  {f.correctiveActionTrigger
                    ? f.correctiveActionRequired
                      ? " · corrective required"
                      : " · corrective optional"
                    : ""}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      {!validation.valid ? (
        <ul
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          data-testid="template-validation-errors"
        >
          {validation.errors.map((e) => (
            <li key={e.code}>{e.message}</li>
          ))}
        </ul>
      ) : null}
      {publishValidation.warnings.length > 0 ? (
        <ul
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          data-testid="template-validation-warnings"
        >
          {publishValidation.warnings.map((w) => (
            <li key={w.code}>{w.message}</li>
          ))}
        </ul>
      ) : null}

      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          {onSave ? (
            <button
              type="button"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              disabled={pending || !validation.valid}
              onClick={() => onSave(draft)}
              data-testid="template-save-draft"
            >
              {pending ? "Saving…" : "Save draft"}
            </button>
          ) : null}
          {onPublish ? (
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-900 disabled:opacity-50"
              disabled={pending || !publishValidation.valid}
              onClick={() => onPublish(draft)}
              data-testid="template-publish-from-editor"
            >
              Save &amp; publish
            </button>
          ) : null}
          {onCancel ? (
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700"
              disabled={pending}
              onClick={onCancel}
              data-testid="template-editor-cancel"
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function blankTemplateDraft(
  purposeType: TemplateDraftInput["purposeType"] = "LOG",
): TemplateDraftInput {
  return {
    name: "",
    description: null,
    instructions: null,
    purposeType,
    allowAdHoc: false,
    fields: [emptyField(1)],
    applicabilities: [],
    schedules: [],
  };
}

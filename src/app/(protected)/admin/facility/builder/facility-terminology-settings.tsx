"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Drawer } from "@/components/drawer";
import type { FacilityVocabulary, FacilityVocabularyProfileKey } from "@/lib/facility-builder/facility-vocabulary";
import {
  VOCABULARY_PROFILE_OPTIONS,
  VOCABULARY_LABEL_MAX_LENGTH,
  draftFacilityVocabulary,
  buildVocabularyHierarchyPreview,
  formatVocabularySummary,
  pluralizeLabel,
  validateCustomVocabularyLabels,
} from "@/lib/facility-builder/facility-vocabulary";
import { updateFacilityVocabularyAction } from "./actions";

type CustomFields = {
  level1Singular: string;
  level1Plural: string;
  level2Singular: string;
  level2Plural: string;
  level3Singular: string;
  level3Plural: string;
};

function customFieldsFromVocabulary(v: FacilityVocabulary): CustomFields {
  return {
    level1Singular: v.level1.singular,
    level1Plural: v.level1.plural,
    level2Singular: v.level2.singular,
    level2Plural: v.level2.plural,
    level3Singular: v.level3.singular,
    level3Plural: v.level3.plural,
  };
}

/**
 * Lightweight Facility Terminology bar + Change Terminology drawer.
 * All labels / preview / save flow through the existing vocabulary module.
 */
export function FacilityTerminologySettings({
  vocabulary,
}: {
  vocabulary: FacilityVocabulary;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm"
        data-testid="facility-terminology-bar"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Facility Terminology
          </p>
          <p className="mt-0.5 text-sm font-medium text-zinc-900">
            {vocabulary.profileLabel}
            <span className="mx-2 text-zinc-300">·</span>
            <span className="font-normal text-zinc-600">
              {formatVocabularySummary(vocabulary)}
            </span>
          </p>
        </div>
        <button
          type="button"
          data-testid="change-terminology"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Change Terminology
        </button>
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Facility Terminology"
      >
        <TerminologyEditor
          initial={vocabulary}
          onDone={() => setOpen(false)}
        />
      </Drawer>
    </>
  );
}

function TerminologyEditor({
  initial,
  onDone,
}: {
  initial: FacilityVocabulary;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [profileKey, setProfileKey] = useState<FacilityVocabularyProfileKey>(
    initial.profileKey,
  );
  const [custom, setCustom] = useState<CustomFields>(() =>
    customFieldsFromVocabulary(
      initial.profileKey === "custom"
        ? initial
        : draftFacilityVocabulary({ profileKey: "custom" }),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  /** Tracks which plural fields the user edited manually (don't auto-overwrite). */
  const [pluralTouched, setPluralTouched] = useState({
    level1: false,
    level2: false,
    level3: false,
  });

  // Reset when the drawer remounts with a new saved vocabulary.
  useEffect(() => {
    // Baseline: pre-existing reset-on-prop-change. Replacing it changes whether an
    // in-progress edit survives a parent refresh, which is a product decision.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfileKey(initial.profileKey);
    setCustom(
      customFieldsFromVocabulary(
        initial.profileKey === "custom"
          ? initial
          : draftFacilityVocabulary({ profileKey: "custom" }),
      ),
    );
    setPluralTouched({ level1: false, level2: false, level3: false });
    setError(null);
  }, [initial]);

  const draft = useMemo(
    () =>
      draftFacilityVocabulary({
        profileKey,
        ...custom,
      }),
    [profileKey, custom],
  );

  const preview = useMemo(
    () => buildVocabularyHierarchyPreview(draft),
    [draft],
  );

  function updateSingular(
    level: "level1" | "level2" | "level3",
    singular: string,
  ) {
    const singularKey = `${level}Singular` as keyof CustomFields;
    const pluralKey = `${level}Plural` as keyof CustomFields;
    setCustom((prev) => {
      const next = { ...prev, [singularKey]: singular };
      if (!pluralTouched[level]) {
        next[pluralKey] = pluralizeLabel(singular);
      }
      return next;
    });
  }

  function handleSave() {
    setError(null);
    if (profileKey === "custom") {
      const errors = validateCustomVocabularyLabels(custom);
      if (errors.length > 0) {
        setError(errors[0]!.message);
        return;
      }
    }

    startTransition(async () => {
      try {
        await updateFacilityVocabularyAction({
          profileKey,
          ...custom,
        });
        router.refresh();
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save terminology.");
      }
    });
  }

  return (
    <div className="space-y-5" data-testid="terminology-editor">
      <p className="text-sm text-zinc-600">
        Choose how this facility names its physical hierarchy. This only changes
        labels — the underlying structure stays the same.
      </p>

      {/* Profile list — from VOCABULARY_PROFILE_OPTIONS, not a hard-coded parallel list */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Vocabulary profile
        </legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {VOCABULARY_PROFILE_OPTIONS.map((opt) => {
            const selected = profileKey === opt.key;
            const sample =
              opt.key === "custom"
                ? null
                : draftFacilityVocabulary({ profileKey: opt.key });
            return (
              <label
                key={opt.key}
                className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2.5 transition-colors ${
                  selected
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="vocabularyProfile"
                    value={opt.key}
                    checked={selected}
                    onChange={() => setProfileKey(opt.key)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">{opt.label}</span>
                </span>
                {sample && (
                  <span
                    className={`mt-1 text-[11px] ${
                      selected ? "text-zinc-300" : "text-zinc-500"
                    }`}
                  >
                    {formatVocabularySummary(sample)}
                  </span>
                )}
                {opt.key === "custom" && (
                  <span
                    className={`mt-1 text-[11px] ${
                      selected ? "text-zinc-300" : "text-zinc-500"
                    }`}
                  >
                    Define your own labels
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Custom fields */}
      {profileKey === "custom" && (
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
          <p className="text-xs font-medium text-zinc-600">Custom labels</p>
          {(
            [
              { level: "level1" as const, title: "Level 1" },
              { level: "level2" as const, title: "Level 2" },
              { level: "level3" as const, title: "Level 3" },
            ] as const
          ).map(({ level, title }) => (
            <div key={level} className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                {title} singular
                <input
                  data-testid={`custom-${level}-singular`}
                  value={custom[`${level}Singular`]}
                  maxLength={VOCABULARY_LABEL_MAX_LENGTH}
                  onChange={(e) => updateSingular(level, e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                {title} plural
                <input
                  data-testid={`custom-${level}-plural`}
                  value={custom[`${level}Plural`]}
                  maxLength={VOCABULARY_LABEL_MAX_LENGTH}
                  onChange={(e) => {
                    setPluralTouched((t) => ({ ...t, [level]: true }));
                    setCustom((prev) => ({
                      ...prev,
                      [`${level}Plural`]: e.target.value,
                    }));
                  }}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                />
              </label>
            </div>
          ))}
        </div>
      )}

      {/* Live preview — from buildVocabularyHierarchyPreview → buildBuilderCopy */}
      <div
        className="rounded-lg border border-zinc-200 bg-white p-4"
        data-testid="terminology-preview"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Live preview
        </p>
        <p className="mt-1 text-sm font-semibold text-zinc-900">
          {preview.profileLabel}
        </p>
        <div className="mt-3 font-mono text-sm leading-relaxed text-zinc-700">
          <div>{preview.lines[0]}</div>
          <div className="pl-4">└── {preview.lines[1]}</div>
          <div className="pl-10">└── {preview.lines[2]}</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3">
          <span className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white">
            + {preview.toolbar.addLevel1}
          </span>
          <span className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700">
            + {preview.toolbar.addLevel2}
          </span>
          <span className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700">
            + {preview.toolbar.addLevel3}
          </span>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-zinc-100 pt-4">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="save-terminology"
          disabled={isPending}
          onClick={handleSave}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save terminology"}
        </button>
      </div>
    </div>
  );
}

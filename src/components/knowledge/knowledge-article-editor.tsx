"use client";

import { useMemo, useState } from "react";
import type {
  KnowledgeArticleCategory,
  KnowledgeArticleStatus,
  KnowledgeSourceType,
} from "@prisma/client";

import { upsertKnowledgeArticleAction } from "@/app/(protected)/admin/knowledge/actions";
import {
  KNOWLEDGE_CATEGORY_LABEL,
  KNOWLEDGE_SOURCE_LABEL,
} from "@/lib/knowledge/labels";

type SelectOption = { id: string; label: string };

type KnowledgeArticleEditorProps = {
  mode: "create" | "edit";
  articleId?: string;
  initialTitle?: string;
  initialSummary?: string;
  initialBody?: string;
  initialCategory?: KnowledgeArticleCategory;
  initialSourceType?: KnowledgeSourceType;
  initialDepartmentId?: string;
  initialStatus?: KnowledgeArticleStatus;
  initialUnitIds?: string[];
  initialAssetIds?: string[];
  initialLogTemplateIds?: string[];
  initialInspectionDefinitionIds?: string[];
  departments: SelectOption[];
  units: SelectOption[];
  assets: SelectOption[];
  logTemplates: SelectOption[];
  inspectionDefinitions: SelectOption[];
};

export function KnowledgeArticleEditor({
  mode,
  articleId,
  initialTitle = "",
  initialSummary = "",
  initialBody = "",
  initialCategory = "SOP",
  initialSourceType = "MANUAL",
  initialDepartmentId = "",
  initialStatus = "DRAFT",
  initialUnitIds = [],
  initialAssetIds = [],
  initialLogTemplateIds = [],
  initialInspectionDefinitionIds = [],
  departments,
  units,
  assets,
  logTemplates,
  inspectionDefinitions,
}: KnowledgeArticleEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [unitIds, setUnitIds] = useState<Set<string>>(new Set(initialUnitIds));
  const [assetIds, setAssetIds] = useState<Set<string>>(new Set(initialAssetIds));
  const [logTemplateIds, setLogTemplateIds] = useState<Set<string>>(new Set(initialLogTemplateIds));
  const [inspectionDefinitionIds, setInspectionDefinitionIds] = useState<Set<string>>(
    new Set(initialInspectionDefinitionIds),
  );

  const categoryOptions = useMemo(
    () => Object.entries(KNOWLEDGE_CATEGORY_LABEL) as Array<[KnowledgeArticleCategory, string]>,
    [],
  );
  const sourceOptions = useMemo(
    () => Object.entries(KNOWLEDGE_SOURCE_LABEL) as Array<[KnowledgeSourceType, string]>,
    [],
  );

  function toggleId(set: Set<string>, id: string, checked: boolean) {
    const next = new Set(set);
    if (checked) next.add(id);
    else next.delete(id);
    return next;
  }

  async function submit(status: KnowledgeArticleStatus) {
    setError(null);
    setPending(true);
    const form = document.getElementById("knowledge-article-form") as HTMLFormElement | null;
    if (!form) {
      setPending(false);
      return;
    }
    const formData = new FormData(form);
    if (articleId) formData.set("articleId", articleId);
    formData.set("status", status);
    formData.set("unitIdsJson", JSON.stringify([...unitIds]));
    formData.set("assetIdsJson", JSON.stringify([...assetIds]));
    formData.set("logTemplateIdsJson", JSON.stringify([...logTemplateIds]));
    formData.set("inspectionDefinitionIdsJson", JSON.stringify([...inspectionDefinitionIds]));

    try {
      const result = await upsertKnowledgeArticleAction(formData);
      if (!result.ok) {
        setError(result.message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <form id="knowledge-article-form" className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm font-medium text-zinc-800 md:col-span-2">
            Title
            <input
              name="title"
              required
              minLength={3}
              maxLength={200}
              defaultValue={initialTitle}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-800 md:col-span-2">
            Summary (optional)
            <input
              name="summary"
              maxLength={500}
              defaultValue={initialSummary}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-800">
            Category
            <select
              name="category"
              defaultValue={initialCategory}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              {categoryOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-zinc-800">
            Source type
            <select
              name="sourceType"
              defaultValue={initialSourceType}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              {sourceOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-zinc-800 md:col-span-2">
            Department scope (optional — leave blank for facility-wide)
            <select
              name="departmentId"
              defaultValue={initialDepartmentId}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Facility-wide</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium text-zinc-800">
          Body
          <textarea
            name="body"
            required
            minLength={1}
            rows={12}
            defaultValue={initialBody}
            placeholder="Plain text instructions, steps, or reference notes."
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
          />
        </label>

        <ObjectLinkFieldset
          title="Linked locations"
          options={units}
          selected={unitIds}
          onToggle={(id, checked) => setUnitIds(toggleId(unitIds, id, checked))}
        />
        <ObjectLinkFieldset
          title="Linked assets"
          options={assets}
          selected={assetIds}
          onToggle={(id, checked) => setAssetIds(toggleId(assetIds, id, checked))}
        />
        <ObjectLinkFieldset
          title="Linked log templates"
          options={logTemplates}
          selected={logTemplateIds}
          onToggle={(id, checked) => setLogTemplateIds(toggleId(logTemplateIds, id, checked))}
        />
        <ObjectLinkFieldset
          title="Linked inspections"
          options={inspectionDefinitions}
          selected={inspectionDefinitionIds}
          onToggle={(id, checked) =>
            setInspectionDefinitionIds(toggleId(inspectionDefinitionIds, id, checked))
          }
        />
      </form>

      <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("DRAFT")}
          className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-60"
        >
          {pending ? "Saving…" : mode === "edit" && initialStatus !== "DRAFT" ? "Save as Draft" : "Save Draft"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("PUBLISHED")}
          className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Publishing…" : "Publish"}
        </button>
      </div>
    </div>
  );
}

function ObjectLinkFieldset({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: SelectOption[];
  selected: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  if (options.length === 0) return null;

  return (
    <fieldset className="rounded-lg border border-zinc-200 p-3">
      <legend className="px-1 text-sm font-semibold text-zinc-800">{title}</legend>
      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
        {options.map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={selected.has(option.id)}
              onChange={(event) => onToggle(option.id, event.target.checked)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

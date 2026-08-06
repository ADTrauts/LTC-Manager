"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createEvidencePresetDraftAction,
  createEvidenceTemplateDraftAction,
  publishEvidenceTemplateAction,
  retireEvidenceTemplateAction,
  updateEvidenceTemplateDraftAction,
} from "@/app/(protected)/staffing/templates/actions";
import {
  blankTemplateDraft,
  TemplateDraftEditor,
  type BuilderAssetOption,
  type BuilderCycleOption,
  type BuilderSpaceOption,
  type BuilderUnitOption,
  type TemplateEditorModel,
} from "@/components/operational-evidence/template-draft-editor";
import type { TemplateDraftInput } from "@/lib/operational-evidence/types";

type TemplateRow = {
  id: string;
  name: string;
  purposeType: string;
  status: string;
  version: number;
  stableKey: string;
  presetKey: string | null;
  description: string | null;
  instructions: string | null;
  allowAdHoc: boolean;
  fields: TemplateEditorModel["fields"];
  applicabilities: NonNullable<TemplateEditorModel["applicabilities"]>;
  schedules: NonNullable<TemplateEditorModel["schedules"]>;
  _count: { fields: number; applicabilities: number; schedules: number };
};

type Props = {
  facilityId: string;
  departmentId: string;
  canManage: boolean;
  canPublish: boolean;
  templates: TemplateRow[];
  presets: Array<{
    presetKey: string;
    name: string;
    purposeType: string;
    description: string;
  }>;
  assets: BuilderAssetOption[];
  spaces: BuilderSpaceOption[];
  units: BuilderUnitOption[];
  cycleOptions: BuilderCycleOption[];
  assetTypes: string[];
};

function toEditorModel(row: TemplateRow): TemplateEditorModel {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    purposeType: row.purposeType as TemplateDraftInput["purposeType"],
    allowAdHoc: row.allowAdHoc,
    presetKey: row.presetKey,
    stableKey: row.stableKey,
    status: row.status,
    version: row.version,
    fields: row.fields,
    applicabilities: row.applicabilities,
    schedules: row.schedules,
  };
}

export function OperationalTemplateBuilderPanel({
  facilityId,
  departmentId,
  canManage,
  canPublish,
  templates,
  presets,
  assets,
  spaces,
  units,
  cycleOptions,
  assetTypes,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    mode: "create" | "edit" | "readonly" | "successor";
    model: TemplateEditorModel;
    templateId?: string;
  } | null>(null);
  const [retireConfirmId, setRetireConfirmId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "PUBLISHED" | "RETIRED">(
    "ALL",
  );

  const drafts = templates.filter((t) => t.status === "DRAFT");
  const published = templates.filter((t) => t.status === "PUBLISHED");
  const retired = templates.filter((t) => t.status === "RETIRED");

  function run(action: () => Promise<unknown>, okMessage: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        setMessage(okMessage);
        setEditor(null);
        setRetireConfirmId(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  return (
    <div className="space-y-6" data-testid="operational-template-builder-panel">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}

      {canManage && !editor ? (
        <section
          className="rounded-md border border-zinc-200 bg-white p-4"
          data-testid="template-create-section"
        >
          <h2 className="text-sm font-semibold text-zinc-900">Create template</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Build a blank LOG, CHECKLIST, or INSPECTION, or start from a Dietary preset. Presets are
            always Drafts and are never auto-published.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["LOG", "CHECKLIST", "INSPECTION"] as const).map((purpose) => (
              <button
                key={purpose}
                type="button"
                data-testid={`create-blank-${purpose}`}
                disabled={pending}
                className="rounded-md border border-zinc-300 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                onClick={() =>
                  setEditor({
                    mode: "create",
                    model: { ...blankTemplateDraft(purpose), purposeType: purpose },
                  })
                }
              >
                Blank {purpose}
              </button>
            ))}
          </div>
          <ul className="mt-4 space-y-2" data-testid="template-preset-create">
            {presets.map((preset) => (
              <li
                key={preset.presetKey}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-100 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">{preset.name}</p>
                  <p className="text-xs text-zinc-500">
                    {preset.purposeType} — {preset.description}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid={`create-preset-${preset.presetKey}`}
                  disabled={pending}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-900 disabled:opacity-50"
                  onClick={() =>
                    run(
                      () =>
                        createEvidencePresetDraftAction({
                          facilityId,
                          departmentId,
                          presetKey: preset.presetKey,
                        }),
                      `Created draft: ${preset.name}`,
                    )
                  }
                >
                  Create draft
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {editor ? (
        <section
          className="rounded-md border border-zinc-200 bg-white p-4"
          data-testid="template-editor-shell"
        >
          <h2 className="text-sm font-semibold text-zinc-900">
            {editor.mode === "create"
              ? "New draft"
              : editor.mode === "successor"
                ? `Successor draft of ${editor.model.name} v${editor.model.version}`
                : editor.mode === "readonly"
                  ? `${editor.model.name} v${editor.model.version} (read-only)`
                  : `Edit draft · ${editor.model.name}`}
          </h2>
          <div className="mt-3">
            <TemplateDraftEditor
              mode={editor.mode === "readonly" ? "readonly" : "edit"}
              initial={editor.model}
              assets={assets}
              spaces={spaces}
              units={units}
              cycleOptions={cycleOptions}
              assetTypes={assetTypes}
              pending={pending}
              onCancel={() => setEditor(null)}
              onSave={
                canManage
                  ? (draft) => {
                      if (editor.mode === "create" || editor.mode === "successor") {
                        run(
                          () =>
                            createEvidenceTemplateDraftAction({
                              facilityId,
                              departmentId,
                              draft: {
                                ...draft,
                                stableKey:
                                  editor.mode === "successor"
                                    ? editor.model.stableKey
                                    : undefined,
                              },
                            }),
                          editor.mode === "successor"
                            ? "Successor draft created."
                            : "Draft created.",
                        );
                      } else if (editor.templateId) {
                        run(
                          () =>
                            updateEvidenceTemplateDraftAction({
                              facilityId,
                              departmentId,
                              templateId: editor.templateId!,
                              draft,
                            }),
                          "Draft saved.",
                        );
                      }
                    }
                  : undefined
              }
              onPublish={
                canPublish && editor.mode !== "readonly"
                  ? (draft) => {
                      run(async () => {
                        if (editor.mode === "create" || editor.mode === "successor") {
                          const created = await createEvidenceTemplateDraftAction({
                            facilityId,
                            departmentId,
                            draft: {
                              ...draft,
                              stableKey:
                                editor.mode === "successor"
                                  ? editor.model.stableKey
                                  : undefined,
                            },
                          });
                          await publishEvidenceTemplateAction({
                            facilityId,
                            departmentId,
                            templateId: created.id,
                          });
                          return;
                        }
                        if (editor.templateId) {
                          await updateEvidenceTemplateDraftAction({
                            facilityId,
                            departmentId,
                            templateId: editor.templateId,
                            draft,
                          });
                          await publishEvidenceTemplateAction({
                            facilityId,
                            departmentId,
                            templateId: editor.templateId,
                          });
                        }
                      }, "Template published.");
                    }
                  : undefined
              }
            />
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2" data-testid="template-status-filter">
        {(["ALL", "DRAFT", "PUBLISHED", "RETIRED"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`rounded-md border px-2 py-1 text-xs ${
              statusFilter === s
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-800"
            }`}
            onClick={() => setStatusFilter(s)}
            data-testid={`template-filter-${s}`}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            {s === "DRAFT" ? ` (${drafts.length})` : ""}
            {s === "PUBLISHED" ? ` (${published.length})` : ""}
            {s === "RETIRED" ? ` (${retired.length})` : ""}
          </button>
        ))}
      </div>

      {(statusFilter === "ALL" || statusFilter === "DRAFT") ? (
      <TemplateList
        title="Drafts"
        empty="No draft templates."
        rows={drafts}
        canManage={canManage}
        canPublish={canPublish}
        pending={pending}
        retireConfirmId={null}
        onEdit={(row) =>
          setEditor({ mode: "edit", model: toEditorModel(row), templateId: row.id })
        }
        onView={(row) =>
          setEditor({ mode: "readonly", model: toEditorModel(row), templateId: row.id })
        }
        onPublish={(templateId) =>
          run(
            () => publishEvidenceTemplateAction({ facilityId, departmentId, templateId }),
            "Template published.",
          )
        }
        testId="template-drafts"
      />
      ) : null}
      {(statusFilter === "ALL" || statusFilter === "PUBLISHED") ? (
      <TemplateList
        title="Published"
        empty="No published templates."
        rows={published}
        canManage={canManage}
        canPublish={canPublish}
        pending={pending}
        retireConfirmId={retireConfirmId}
        onView={(row) =>
          setEditor({ mode: "readonly", model: toEditorModel(row), templateId: row.id })
        }
        onSuccessor={(row) =>
          setEditor({
            mode: "successor",
            model: { ...toEditorModel(row), status: "DRAFT" },
          })
        }
        onRetireRequest={(id) => setRetireConfirmId(id)}
        onRetireCancel={() => setRetireConfirmId(null)}
        onRetireConfirm={(templateId) =>
          run(
            () => retireEvidenceTemplateAction({ facilityId, departmentId, templateId }),
            "Template retired. Historical records remain.",
          )
        }
        testId="template-published"
      />
      ) : null}
      {(statusFilter === "ALL" || statusFilter === "RETIRED") ? (
      <TemplateList
        title="Retired"
        empty="No retired templates."
        rows={retired}
        canManage={false}
        canPublish={false}
        pending={pending}
        retireConfirmId={null}
        onView={(row) =>
          setEditor({ mode: "readonly", model: toEditorModel(row), templateId: row.id })
        }
        testId="template-retired"
      />
      ) : null}
    </div>
  );
}

function TemplateList(props: {
  title: string;
  empty: string;
  rows: TemplateRow[];
  canManage: boolean;
  canPublish: boolean;
  pending: boolean;
  retireConfirmId: string | null;
  onEdit?: (row: TemplateRow) => void;
  onView?: (row: TemplateRow) => void;
  onSuccessor?: (row: TemplateRow) => void;
  onPublish?: (id: string) => void;
  onRetireRequest?: (id: string) => void;
  onRetireCancel?: () => void;
  onRetireConfirm?: (id: string) => void;
  testId: string;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4" data-testid={props.testId}>
      <h2 className="text-sm font-semibold text-zinc-900">{props.title}</h2>
      {props.rows.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">{props.empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100">
          {props.rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
              data-testid={`template-row-${row.id}`}
              data-template-status={row.status}
              data-template-name={row.name}
              data-template-version={row.version}
              data-template-stable-key={row.stableKey}
            >
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {row.name}{" "}
                  <span className="text-xs font-normal text-zinc-500">
                    v{row.version} · {row.purposeType} · {row.status}
                  </span>
                </p>
                <p className="text-xs text-zinc-500">
                  {row._count.fields} fields · {row._count.applicabilities} applicability ·{" "}
                  {row._count.schedules} schedules
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {props.onView ? (
                  <button
                    type="button"
                    data-testid={`view-template-${row.id}`}
                    disabled={props.pending}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-900 disabled:opacity-50"
                    onClick={() => props.onView?.(row)}
                  >
                    View
                  </button>
                ) : null}
                {row.status === "DRAFT" && props.canManage && props.onEdit ? (
                  <button
                    type="button"
                    data-testid={`edit-template-${row.id}`}
                    disabled={props.pending}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-900 disabled:opacity-50"
                    onClick={() => props.onEdit?.(row)}
                  >
                    Edit
                  </button>
                ) : null}
                {row.status === "DRAFT" && props.canPublish && props.onPublish ? (
                  <button
                    type="button"
                    data-testid={`publish-template-${row.id}`}
                    disabled={props.pending}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-900 disabled:opacity-50"
                    onClick={() => props.onPublish?.(row.id)}
                  >
                    Publish
                  </button>
                ) : null}
                {row.status === "PUBLISHED" && props.canManage && props.onSuccessor ? (
                  <button
                    type="button"
                    data-testid={`successor-template-${row.id}`}
                    disabled={props.pending}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-900 disabled:opacity-50"
                    onClick={() => props.onSuccessor?.(row)}
                  >
                    Create successor
                  </button>
                ) : null}
                {row.status === "PUBLISHED" && props.canPublish ? (
                  props.retireConfirmId === row.id ? (
                    <div
                      className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1"
                      data-testid={`retire-confirm-${row.id}`}
                    >
                      <span className="text-xs text-amber-900">Retire permanently for new work?</span>
                      <button
                        type="button"
                        data-testid={`retire-confirm-yes-${row.id}`}
                        disabled={props.pending}
                        className="rounded-md bg-amber-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                        onClick={() => props.onRetireConfirm?.(row.id)}
                      >
                        Confirm retire
                      </button>
                      <button
                        type="button"
                        data-testid={`retire-confirm-no-${row.id}`}
                        disabled={props.pending}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                        onClick={() => props.onRetireCancel?.()}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-testid={`retire-template-${row.id}`}
                      disabled={props.pending}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-900 disabled:opacity-50"
                      onClick={() => props.onRetireRequest?.(row.id)}
                    >
                      Retire
                    </button>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  createWorkPlanDraftAction,
  createWorkPlanPresetDraftAction,
  createWorkPlanSuccessorAction,
  duplicateWorkPlanAction,
  publishWorkPlanAction,
  retireWorkPlanAction,
  updateWorkPlanDraftAction,
} from "@/app/(protected)/staffing/work-plans/actions";
import type { WorkItemDraftInput, WorkPlanDraftInput } from "@/lib/department-work/types";

type PlanRow = {
  id: string;
  name: string;
  status: string;
  version: number;
  stableKey: string;
  presetKey: string | null;
  description: string | null;
  weekdays: number[];
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  items: Array<{
    id: string;
    itemKey: string;
    label: string;
    instructions: string | null;
    displaySequence: number;
    priority: WorkItemDraftInput["priority"];
    completionMode: WorkItemDraftInput["completionMode"];
    responsibilityMode: WorkItemDraftInput["responsibilityMode"];
    scheduleKind: WorkItemDraftInput["scheduleKind"];
    cycleStableKeys: string[];
    windowStartLocal: string | null;
    windowEndLocal: string | null;
    roleKeys: string[];
    knowledgeArticleId: string | null;
    procedureTitleSnapshot: string | null;
    linkedTemplateStableKey: string | null;
    linkedTemplateId: string | null;
    supervisorVisible: boolean;
  }>;
  applicabilities: Array<{
    kind: NonNullable<WorkPlanDraftInput["applicabilities"]>[number]["kind"];
    unitId: string | null;
    spaceId: string | null;
    spaceType: string | null;
    assetId: string | null;
    assetType: string | null;
  }>;
  _count: { items: number };
};

type ProcedureOption = { id: string; title: string };
type UnitOption = { id: string; name: string };
type CycleOption = { stableKey: string; label: string };
type TemplateOption = { id: string; stableKey: string; name: string };

type Props = {
  facilityId: string;
  departmentId: string;
  canManage: boolean;
  canPublish: boolean;
  plans: PlanRow[];
  presets: Array<{ key: string; name: string; description: string | null; itemCount: number }>;
  procedures: ProcedureOption[];
  units: UnitOption[];
  cycleOptions: CycleOption[];
  templates: TemplateOption[];
};

function blankDraft(): WorkPlanDraftInput {
  return {
    name: "New Work Plan",
    description: "",
    weekdays: [],
    applicabilities: [{ kind: "DEPARTMENT_UNIT" }],
    items: [
      {
        itemKey: "step_1",
        label: "Work step",
        instructions: "",
        displaySequence: 10,
        priority: "ROUTINE",
        completionMode: "EXPLICIT_CONFIRMATION",
        responsibilityMode: "UNIT_SHARED",
        scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
        cycleStableKeys: [],
        supervisorVisible: true,
      },
    ],
  };
}

function toDraft(plan: PlanRow): WorkPlanDraftInput {
  return {
    name: plan.name,
    description: plan.description,
    stableKey: plan.stableKey,
    presetKey: plan.presetKey,
    weekdays: plan.weekdays,
    effectiveStartDate: plan.effectiveStartDate,
    effectiveEndDate: plan.effectiveEndDate,
    applicabilities: plan.applicabilities.map((a) => ({
      kind: a.kind,
      unitId: a.unitId,
      spaceId: a.spaceId,
      // Builder stores SpaceType | null from Prisma; cast through unknown for draft input.
      spaceType: (a.spaceType ?? null) as WorkPlanDraftInput["applicabilities"] extends
        | Array<{ spaceType?: infer S }>
        | undefined
        ? S
        : null,
      assetId: a.assetId,
      assetType: a.assetType,
    })),
    items: plan.items.map((item) => ({
      itemKey: item.itemKey,
      label: item.label,
      instructions: item.instructions,
      displaySequence: item.displaySequence,
      priority: item.priority,
      completionMode: item.completionMode,
      responsibilityMode: item.responsibilityMode,
      scheduleKind: item.scheduleKind,
      cycleStableKeys: item.cycleStableKeys,
      windowStartLocal: item.windowStartLocal,
      windowEndLocal: item.windowEndLocal,
      roleKeys: item.roleKeys,
      knowledgeArticleId: item.knowledgeArticleId,
      linkedTemplateStableKey: item.linkedTemplateStableKey,
      linkedTemplateId: item.linkedTemplateId,
      supervisorVisible: item.supervisorVisible,
    })),
  };
}

export function WorkPlanBuilderPanel({
  facilityId,
  departmentId,
  canManage,
  canPublish,
  plans,
  presets,
  procedures,
  units,
  cycleOptions,
  templates,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(plans[0]?.id ?? null);
  const [draft, setDraft] = useState<WorkPlanDraftInput>(() =>
    plans[0] ? toDraft(plans[0]) : blankDraft(),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const selected = useMemo(
    () => plans.find((p) => p.id === selectedId) ?? null,
    [plans, selectedId],
  );
  const isDraft = !selected || selected.status === "DRAFT";

  function selectPlan(plan: PlanRow) {
    setSelectedId(plan.id);
    setDraft(toDraft(plan));
    setMessage(null);
    setError(null);
  }

  function run(action: () => Promise<void>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]" data-testid="work-plan-builder">
      <aside className="space-y-3" data-testid="work-plan-list">
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <>
              <button
                type="button"
                className="rounded-md border px-3 py-1.5 text-sm"
                data-testid="create-work-plan"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const created = await createWorkPlanDraftAction({
                      facilityId,
                      departmentId,
                      draft: blankDraft(),
                    });
                    setMessage(`Created draft ${created.id}`);
                    setSelectedId(created.id);
                  })
                }
              >
                Create blank
              </button>
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-sm"
                  data-testid={`work-plan-preset-${preset.key}`}
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const created = await createWorkPlanPresetDraftAction({
                        facilityId,
                        departmentId,
                        presetKey: preset.key,
                      });
                      setMessage(`Created preset draft ${preset.name}`);
                      setSelectedId(created.id);
                    })
                  }
                >
                  Preset: {preset.name}
                </button>
              ))}
            </>
          ) : null}
        </div>
        <ul className="divide-y rounded-md border">
          {plans.map((plan) => (
            <li key={plan.id}>
              <button
                type="button"
                className={`w-full px-3 py-2 text-left text-sm ${
                  selectedId === plan.id ? "bg-slate-100" : ""
                }`}
                data-testid={`work-plan-row-${plan.id}`}
                onClick={() => selectPlan(plan)}
              >
                <div className="font-medium">{plan.name}</div>
                <div className="text-xs text-slate-600">
                  {plan.status} · v{plan.version} · {plan._count.items} items
                </div>
              </button>
            </li>
          ))}
          {plans.length === 0 ? (
            <li className="px-3 py-4 text-sm text-slate-600">No Work Plans yet.</li>
          ) : null}
        </ul>
      </aside>

      <section className="space-y-4" data-testid="work-plan-editor">
        {message ? (
          <p className="text-sm text-emerald-700" data-testid="work-plan-message">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-700" data-testid="work-plan-error">
            {error}
          </p>
        ) : null}

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Name
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              data-testid="work-plan-name"
              value={draft.name}
              disabled={!canManage || !isDraft || pending}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="block text-sm font-medium">
            Description
            <textarea
              className="mt-1 w-full rounded-md border px-3 py-2"
              data-testid="work-plan-description"
              value={draft.description ?? ""}
              disabled={!canManage || !isDraft || pending}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
        </div>

        <div className="space-y-3" data-testid="work-plan-items">
          <h3 className="text-sm font-semibold">Work Items</h3>
          {draft.items.map((item, index) => (
            <div
              key={`${item.itemKey}-${index}`}
              className="space-y-2 rounded-md border p-3"
              data-testid={`work-plan-item-${index}`}
            >
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                data-testid={`work-plan-item-label-${index}`}
                value={item.label}
                disabled={!canManage || !isDraft || pending}
                onChange={(e) => {
                  const items = [...draft.items];
                  items[index] = { ...item, label: e.target.value };
                  setDraft({ ...draft, items });
                }}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs">
                  Completion
                  <select
                    className="mt-1 w-full rounded-md border px-2 py-1.5"
                    data-testid={`work-plan-item-completion-${index}`}
                    value={item.completionMode ?? "EXPLICIT_CONFIRMATION"}
                    disabled={!canManage || !isDraft || pending}
                    onChange={(e) => {
                      const items = [...draft.items];
                      items[index] = {
                        ...item,
                        completionMode: e.target.value as WorkItemDraftInput["completionMode"],
                      };
                      setDraft({ ...draft, items });
                    }}
                  >
                    <option value="EXPLICIT_CONFIRMATION">Explicit confirmation</option>
                    <option value="LINKED_EVIDENCE">Linked evidence</option>
                  </select>
                </label>
                <label className="text-xs">
                  Responsibility
                  <select
                    className="mt-1 w-full rounded-md border px-2 py-1.5"
                    data-testid={`work-plan-item-responsibility-${index}`}
                    value={item.responsibilityMode ?? "UNIT_SHARED"}
                    disabled={!canManage || !isDraft || pending}
                    onChange={(e) => {
                      const items = [...draft.items];
                      items[index] = {
                        ...item,
                        responsibilityMode: e.target
                          .value as WorkItemDraftInput["responsibilityMode"],
                      };
                      setDraft({ ...draft, items });
                    }}
                  >
                    <option value="UNIT_SHARED">Unit shared</option>
                    <option value="EACH_ASSIGNED_EMPLOYEE">
                      Each assigned employee (reserved)
                    </option>
                  </select>
                </label>
                <label className="text-xs">
                  Procedure
                  <select
                    className="mt-1 w-full rounded-md border px-2 py-1.5"
                    data-testid={`work-plan-item-procedure-${index}`}
                    value={item.knowledgeArticleId ?? ""}
                    disabled={!canManage || !isDraft || pending}
                    onChange={(e) => {
                      const items = [...draft.items];
                      items[index] = {
                        ...item,
                        knowledgeArticleId: e.target.value || null,
                      };
                      setDraft({ ...draft, items });
                    }}
                  >
                    <option value="">None</option>
                    {procedures.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Linked template
                  <select
                    className="mt-1 w-full rounded-md border px-2 py-1.5"
                    data-testid={`work-plan-item-template-${index}`}
                    value={item.linkedTemplateStableKey ?? ""}
                    disabled={!canManage || !isDraft || pending}
                    onChange={(e) => {
                      const tpl = templates.find((t) => t.stableKey === e.target.value);
                      const items = [...draft.items];
                      items[index] = {
                        ...item,
                        linkedTemplateStableKey: tpl?.stableKey ?? null,
                        linkedTemplateId: tpl?.id ?? null,
                      };
                      setDraft({ ...draft, items });
                    }}
                  >
                    <option value="">None</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.stableKey}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Cycle
                  <select
                    className="mt-1 w-full rounded-md border px-2 py-1.5"
                    data-testid={`work-plan-item-cycle-${index}`}
                    value={item.cycleStableKeys?.[0] ?? ""}
                    disabled={!canManage || !isDraft || pending}
                    onChange={(e) => {
                      const items = [...draft.items];
                      items[index] = {
                        ...item,
                        scheduleKind: e.target.value
                          ? "OPERATIONAL_CYCLE"
                          : "ONCE_PER_OPERATIONAL_DATE",
                        cycleStableKeys: e.target.value ? [e.target.value] : [],
                      };
                      setDraft({ ...draft, items });
                    }}
                  >
                    <option value="">Once per day</option>
                    {cycleOptions.map((c) => (
                      <option key={c.stableKey} value={c.stableKey}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
          {canManage && isDraft ? (
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              data-testid="work-plan-add-item"
              onClick={() =>
                setDraft({
                  ...draft,
                  items: [
                    ...draft.items,
                    {
                      itemKey: `step_${draft.items.length + 1}`,
                      label: "New work step",
                      displaySequence: (draft.items.length + 1) * 10,
                      scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
                      responsibilityMode: "UNIT_SHARED",
                      completionMode: "EXPLICIT_CONFIRMATION",
                      supervisorVisible: true,
                    },
                  ],
                })
              }
            >
              Add item
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2" data-testid="work-plan-actions">
          {canManage && isDraft && selected ? (
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white"
              data-testid="work-plan-save-draft"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await updateWorkPlanDraftAction({
                    facilityId,
                    departmentId,
                    workPlanId: selected.id,
                    draft,
                  });
                  setMessage("Draft saved.");
                })
              }
            >
              Save draft
            </button>
          ) : null}
          {canPublish && isDraft && selected ? (
            <button
              type="button"
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white"
              data-testid="publish-work-plan"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await publishWorkPlanAction({
                    facilityId,
                    departmentId,
                    workPlanId: selected.id,
                  });
                  setMessage("Published.");
                })
              }
            >
              Publish
            </button>
          ) : null}
          {canManage && selected?.status === "PUBLISHED" ? (
            <>
              <button
                type="button"
                className="rounded-md border px-3 py-1.5 text-sm"
                data-testid="work-plan-successor"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const created = await createWorkPlanSuccessorAction({
                      facilityId,
                      departmentId,
                      workPlanId: selected.id,
                    });
                    setSelectedId(created.id);
                    setMessage("Successor draft created.");
                  })
                }
              >
                Create successor
              </button>
              <button
                type="button"
                className="rounded-md border px-3 py-1.5 text-sm"
                data-testid="work-plan-retire"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    await retireWorkPlanAction({
                      facilityId,
                      departmentId,
                      workPlanId: selected.id,
                    });
                    setMessage("Retired.");
                  })
                }
              >
                Retire
              </button>
            </>
          ) : null}
          {canManage && selected ? (
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              data-testid="work-plan-duplicate"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const created = await duplicateWorkPlanAction({
                    facilityId,
                    departmentId,
                    workPlanId: selected.id,
                  });
                  setSelectedId(created.id);
                  setMessage("Duplicated.");
                })
              }
            >
              Duplicate
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            data-testid="work-plan-preview-toggle"
            onClick={() => setPreviewOpen((v) => !v)}
          >
            {previewOpen ? "Hide preview" : "Preview"}
          </button>
        </div>

        {previewOpen ? (
          <div
            className="rounded-md border bg-slate-50 p-3 text-sm"
            data-testid="work-plan-preview"
          >
            <p className="font-medium">{draft.name}</p>
            <p className="text-slate-600">{draft.description}</p>
            <ul className="mt-2 list-disc pl-5">
              {draft.items.map((item) => (
                <li key={item.itemKey}>
                  {item.label}
                  {item.knowledgeArticleId
                    ? ` · Procedure: ${
                        procedures.find((p) => p.id === item.knowledgeArticleId)?.title ??
                        item.knowledgeArticleId
                      }`
                    : ""}
                  {units[0] ? ` · Unit scope available (${units.length})` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              Viewing a Procedure never completes Work. Publish is required before Runtime.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

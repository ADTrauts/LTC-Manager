"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/design-system/Button";
import { Field, Select, TextArea, TextInput } from "@/components/design-system/Field";
import { StatusBadge } from "@/components/design-system/StatusBadge";
import {
  collectPmDraftValidationIssues,
} from "@/lib/preventive-maintenance/draft-validation";
import {
  persistPmPriority,
  presentPmPriority,
  cadencePresetFromIntervalMonths,
  defaultSuccessorEffectiveDate,
  formatCadenceSummary,
  formatProjectedDateLabel,
  intervalMonthsFromCadencePreset,
  previewDraftProjectedSchedule,
  PM_CADENCE_PRESETS,
  PM_PRIORITY_OPTIONS,
  type PmCadencePresetId,
} from "@/lib/preventive-maintenance/presentation";
import type {
  PmBuilderAssetOption,
  PmBuilderCategoryOption,
  PmBuilderEmployeeOption,
  PmBuilderProcedureOption,
  PmBuilderTemplateOption,
} from "@/lib/preventive-maintenance/builder-load";
import type { PmBuilderActionState } from "@/app/(protected)/build/departments/[departmentId]/preventive-maintenance/actions";
import {
  createPmPlanAction,
  createPmPlanAndPublishAction,
  createSuccessorDraftAction,
  publishPmPlanAction,
  retirePmPlanAction,
  savePmPlanDraftAction,
} from "@/app/(protected)/build/departments/[departmentId]/preventive-maintenance/actions";

type EditorPlan = {
  id: string;
  status: string;
  assetId: string;
  asset: {
    id: string;
    name: string;
    assetCode: string;
    status: string;
    locationLabel: string;
    conditionLabel: string;
  };
  hasSuccessorDraft: boolean;
  publishedVersion: {
    id: string;
    version: number;
    status: string;
    effectiveDate: string | null;
  } | null;
  editing: {
    id: string;
    version: number;
    status: string;
    createdFromVersionId: string | null;
    name: string;
    instructions: string | null;
    maintenanceCategoryId: string | null;
    intervalMonths: number;
    anchorDate: string;
    effectiveDate: string | null;
    generationLeadDays: number;
    priority: string;
    procedureVersionId: string | null;
    defaultAssignedEmployeeId: string | null;
    recordRequirements: Array<{
      templateId: string;
      templateName: string;
      templateVersion: number;
      sortOrder: number;
    }>;
  };
  history: Array<{
    id: string;
    version: number;
    status: string;
    effectiveDate: string | null;
    publishedAt: string | null;
    cadenceSummary: string;
    procedureLabel: string | null;
    name: string;
  }>;
  generationWarning: { tone: "paused" | "notice"; title: string; detail: string } | null;
};

function versionStatusLabel(status: string) {
  if (status === "PUBLISHED") return "Published";
  if (status === "SUPERSEDED") return "Superseded";
  return "Draft";
}

export function PmPlanEditor({
  departmentId,
  facilityToday,
  mode,
  plan,
  options,
  canDraft,
  canPublish,
  canRetire,
}: {
  departmentId: string;
  facilityToday: string;
  mode: "create" | "edit";
  plan: EditorPlan | null;
  options: {
    assetOptions: PmBuilderAssetOption[];
    categoryOptions: PmBuilderCategoryOption[];
    procedureOptions: PmBuilderProcedureOption[];
    templateOptions: PmBuilderTemplateOption[];
    employeeOptions: PmBuilderEmployeeOption[];
  };
  canDraft: boolean;
  canPublish: boolean;
  canRetire: boolean;
}) {
  const editing = plan?.editing;
  const isCreate = mode === "create";
  const isDraft = isCreate || editing?.status === "DRAFT";
  const published = plan?.publishedVersion ?? null;
  const assetLocked = Boolean(plan && plan.status !== "DRAFT");
  const firstPublish = !published;

  const [name, setName] = useState(editing?.name ?? "");
  const [assetId, setAssetId] = useState(plan?.assetId ?? "");
  const [intervalMonths, setIntervalMonths] = useState(editing?.intervalMonths ?? 3);
  const [cadence, setCadence] = useState<PmCadencePresetId>(
    cadencePresetFromIntervalMonths(editing?.intervalMonths ?? 3),
  );
  const [anchorDate, setAnchorDate] = useState(editing?.anchorDate ?? `${facilityToday.slice(0, 8)}15`);
  const [effectiveDate, setEffectiveDate] = useState(
    editing?.effectiveDate ??
      (published
        ? defaultSuccessorEffectiveDate(facilityToday, published.effectiveDate)
        : facilityToday),
  );
  const [generationLeadDays, setGenerationLeadDays] = useState(editing?.generationLeadDays ?? 7);
  const [categoryId, setCategoryId] = useState(editing?.maintenanceCategoryId ?? "");
  const [priority, setPriority] = useState(
    presentPmPriority(editing?.priority ?? "MEDIUM") === "Routine"
      ? "ROUTINE"
      : presentPmPriority(editing?.priority ?? "MEDIUM") === "High"
        ? "HIGH"
        : presentPmPriority(editing?.priority ?? "MEDIUM") === "Urgent"
          ? "URGENT"
          : "ROUTINE",
  );
  const [procedureVersionId, setProcedureVersionId] = useState(editing?.procedureVersionId ?? "");
  const [assigneeId, setAssigneeId] = useState(editing?.defaultAssignedEmployeeId ?? "");
  const [instructions, setInstructions] = useState(editing?.instructions ?? "");
  const [recordIds, setRecordIds] = useState<string[]>(
    editing?.recordRequirements.map((row) => row.templateId) ?? [],
  );
  const [retireOpen, setRetireOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const createBound = createPmPlanAction.bind(null, departmentId);
  const createPublishBound = createPmPlanAndPublishAction.bind(null, departmentId);
  const saveBound = plan ? savePmPlanDraftAction.bind(null, departmentId, plan.id) : createBound;
  const publishBound = plan
    ? publishPmPlanAction.bind(null, departmentId, plan.id)
    : createPublishBound;

  const [saveState, saveAction] = useActionState(saveBound, null as PmBuilderActionState | null);
  const [publishState, publishAction] = useActionState(
    publishBound,
    null as PmBuilderActionState | null,
  );

  useEffect(() => {
    if (publishState?.ok || saveState?.ok) {
      router.refresh();
    }
  }, [publishState, saveState, router]);

  const selectedAsset =
    options.assetOptions.find((row) => row.id === assetId) ??
    (plan?.asset
      ? {
          id: plan.asset.id,
          name: plan.asset.name,
          assetCode: plan.asset.assetCode,
          locationLabel: plan.asset.locationLabel,
          status: plan.asset.status,
          conditionLabel: plan.asset.conditionLabel,
          retired: plan.asset.status === "RETIRED",
        }
      : null);
  const selectedCategory = options.categoryOptions.find((row) => row.id === categoryId) ?? null;
  const selectedProcedure = options.procedureOptions.find(
    (row) => row.versionId === procedureVersionId,
  );

  const issues = collectPmDraftValidationIssues({
    name,
    assetId: assetId || null,
    assetStatus: selectedAsset?.status,
    maintenanceCategoryId: categoryId || null,
    categoryArchived: selectedCategory?.archived,
    intervalMonths,
    generationLeadDays,
    priority: persistPmPriority(priority),
    anchorDate,
    effectiveDate,
    facilityToday,
    procedureVersionId: procedureVersionId || null,
    procedureEligible: procedureVersionId
      ? options.procedureOptions.some((row) => row.versionId === procedureVersionId)
      : null,
    recordTemplateIds: recordIds,
    recordTemplatesEligible: recordIds.every((id) =>
      options.templateOptions.some((row) => row.id === id) ||
      (editing?.recordRequirements.some((row) => row.templateId === id) ?? false),
    ),
    firstPublish,
    priorEffectiveDate: published?.effectiveDate ?? null,
  });

  const projected = useMemo(() => {
    try {
      return previewDraftProjectedSchedule({
        intervalMonths,
        anchorDate,
        effectiveDate,
        cycles: 4,
      });
    } catch {
      return [];
    }
  }, [intervalMonths, anchorDate, effectiveDate]);

  const readOnly = !canDraft || !isDraft || plan?.status === "RETIRED";
  const error = publishState?.ok === false ? publishState.error : saveState?.ok === false ? saveState.error : null;

  const hiddenFields = (
    <>
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="intervalMonths" value={String(intervalMonths)} />
      <input type="hidden" name="generationLeadDays" value={String(generationLeadDays)} />
      <input type="hidden" name="anchorDate" value={anchorDate} />
      <input type="hidden" name="effectiveDate" value={effectiveDate} />
      <input type="hidden" name="maintenanceCategoryId" value={categoryId} />
      <input type="hidden" name="priority" value={priority} />
      <input type="hidden" name="procedureVersionId" value={procedureVersionId} />
      <input type="hidden" name="defaultAssignedEmployeeId" value={assigneeId} />
      <input type="hidden" name="instructions" value={instructions} />
      {recordIds.map((id) => (
        <input key={id} type="hidden" name="recordTemplateId" value={id} />
      ))}
    </>
  );

  return (
    <div className="space-y-6" data-testid="pm-plan-editor">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">
          {isCreate ? "Create Preventive Maintenance Plan" : name || "Preventive Maintenance Plan"}
        </h1>
        {plan?.status === "RETIRED" ? (
          <p
            className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800"
            data-testid="pm-plan-retired"
          >
            This plan is retired. Future preventive maintenance will no longer be generated. History
            remains.
          </p>
        ) : null}
        {published && isDraft ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="pm-successor-banner">
            Draft changes based on Version {published.version}. Current published Version{" "}
            {published.version} remains active until these changes are published.
          </p>
        ) : null}
        {plan?.generationWarning ? (
          <p
            className={`mt-2 rounded-md border px-3 py-2 text-sm ${
              plan.generationWarning.tone === "paused"
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-zinc-200 bg-zinc-50 text-zinc-800"
            }`}
            data-testid={
              plan.generationWarning.tone === "paused"
                ? "pm-generation-paused"
                : "pm-asset-oos-notice"
            }
          >
            <span className="font-medium">{plan.generationWarning.title}</span>
            {" — "}
            {plan.generationWarning.detail}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert" data-testid="pm-editor-error">
          {error}
        </p>
      ) : null}

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-base font-semibold text-zinc-900">Identity</h2>
        <TextInput
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
          data-testid="pm-field-name"
          placeholder="Quarterly Dishwasher PM"
        />
        <Select
          label="Asset"
          required
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          disabled={readOnly || assetLocked}
          data-testid="pm-field-asset"
          helper={
            selectedAsset
              ? `${selectedAsset.assetCode} · ${selectedAsset.locationLabel} · ${selectedAsset.conditionLabel}`
              : "Choose a Facility Asset. Asset identity is not copied into this plan."
          }
        >
          <option value="">Select asset</option>
          {options.assetOptions.map((row) => (
            <option key={row.id} value={row.id} disabled={row.retired}>
              {row.name} ({row.assetCode}) — {row.conditionLabel}
            </option>
          ))}
        </Select>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-base font-semibold text-zinc-900">Schedule</h2>
        <Select
          label="Repeats"
          value={cadence}
          onChange={(e) => {
            const next = e.target.value as PmCadencePresetId;
            setCadence(next);
            if (next !== "custom") {
              setIntervalMonths(intervalMonthsFromCadencePreset(next));
            }
          }}
          disabled={readOnly}
          data-testid="pm-field-cadence"
        >
          {PM_CADENCE_PRESETS.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </Select>
        {cadence === "custom" ? (
          <TextInput
            label="Every N months"
            type="number"
            min={1}
            step={1}
            value={String(intervalMonths)}
            onChange={(e) => setIntervalMonths(Number(e.target.value))}
            disabled={readOnly}
            data-testid="pm-field-interval"
          />
        ) : null}
        <TextInput
          label="Schedule starts"
          type="date"
          required
          value={anchorDate}
          onChange={(e) => setAnchorDate(e.target.value)}
          disabled={readOnly}
          data-testid="pm-field-anchor"
          helper="Scheduled dates stay fixed even if maintenance is completed late."
        />
        <TextInput
          label={published ? "Changes take effect" : "Effective date"}
          type="date"
          required
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
          disabled={readOnly}
          data-testid="pm-field-effective"
          helper={
            published
              ? "Already generated preventive Work Orders will not change."
              : "The first scheduled date is on or after this date."
          }
        />
        <TextInput
          label="Create Work Order this many days before scheduled date"
          type="number"
          min={0}
          step={1}
          value={String(generationLeadDays)}
          onChange={(e) => setGenerationLeadDays(Number(e.target.value))}
          disabled={readOnly}
          data-testid="pm-field-lead"
          helper="Default 7 days. This is not a due window."
        />
        <div data-testid="pm-schedule-preview" className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3">
          <p className="text-sm font-medium text-zinc-900">Upcoming schedule</p>
          <p className="mt-1 text-xs text-zinc-600">
            Repeats {formatCadenceSummary(intervalMonths).toLowerCase()} from{" "}
            {anchorDate ? formatProjectedDateLabel(anchorDate, { includeYear: true }) : "—"}. These
            dates are a preview. Work Orders are created when scheduled maintenance comes due.
          </p>
          <ol className="mt-2 flex flex-wrap gap-2" data-testid="pm-projected-dates">
            {projected.map((row) => (
              <li
                key={row.scheduledDate}
                className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-800"
              >
                {formatProjectedDateLabel(row.scheduledDate, { includeYear: true })}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-base font-semibold text-zinc-900">Work Order defaults</h2>
        <Select
          label="Maintenance category"
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          disabled={readOnly}
          data-testid="pm-field-category"
        >
          <option value="">Select category</option>
          {options.categoryOptions.map((row) => (
            <option key={row.id} value={row.id} disabled={row.archived}>
              {row.label}
              {row.archived ? " (archived)" : ""}
            </option>
          ))}
        </Select>
        <Select
          label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          disabled={readOnly}
          data-testid="pm-field-priority"
        >
          {PM_PRIORITY_OPTIONS.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </Select>
        <Select
          label="Default technician"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          disabled={readOnly}
          data-testid="pm-field-technician"
          helper="If unavailable when the Work Order is generated, it will be created unassigned."
        >
          <option value="">Unassigned</option>
          {options.employeeOptions.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </Select>
        <Select
          label="Procedure"
          value={procedureVersionId}
          onChange={(e) => setProcedureVersionId(e.target.value)}
          disabled={readOnly}
          data-testid="pm-field-procedure"
          helper={
            selectedProcedure
              ? `This plan will use Procedure v${selectedProcedure.version}. Future Procedure updates will not change already published PM configuration.`
              : "Optional. Pins the published Procedure version."
          }
        >
          <option value="">None</option>
          {options.procedureOptions.map((row) => (
            <option key={row.versionId} value={row.versionId}>
              {row.title} v{row.version}
            </option>
          ))}
        </Select>
        <TextArea
          label="Instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          disabled={readOnly}
          data-testid="pm-field-instructions"
        />
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-base font-semibold text-zinc-900">Required evidence</h2>
        <p className="text-sm text-zinc-600">
          Published Record templates pinned to this plan version. Later template updates do not
          change already published configuration.
        </p>
        <Field label="Add Record template">
          <select
            className="min-h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            disabled={readOnly}
            value=""
            data-testid="pm-field-record-add"
            onChange={(e) => {
              const next = e.target.value;
              if (next && !recordIds.includes(next)) setRecordIds([...recordIds, next]);
            }}
          >
            <option value="">Select a published template</option>
            {options.templateOptions
              .filter((row) => !recordIds.includes(row.id))
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.purposeType.toLowerCase()} v{row.version}
                </option>
              ))}
          </select>
        </Field>
        <ul className="space-y-2" data-testid="pm-record-requirements">
          {recordIds.map((id, index) => {
            const option = options.templateOptions.find((row) => row.id === id);
            const pinned = editing?.recordRequirements.find((row) => row.templateId === id);
            return (
              <li
                key={id}
                className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm"
              >
                <span>
                  {index + 1}. {option?.name ?? pinned?.templateName ?? id}
                  {option ? ` v${option.version}` : pinned ? ` v${pinned.templateVersion}` : ""}
                </span>
                {readOnly ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    onClick={() => setRecordIds(recordIds.filter((row) => row !== id))}
                  >
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {isDraft && issues.length > 0 ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3" data-testid="pm-draft-issues">
          <p className="text-sm font-medium text-amber-950">Before publishing</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-950">
            {issues.map((issue) => (
              <li key={issue.code}>{issue.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {canDraft && isDraft ? (
        <div className="flex flex-wrap gap-2">
          <form action={saveAction}>
            {hiddenFields}
            <Button type="submit" variant="secondary" data-testid="pm-save-draft">
              Save draft
            </Button>
          </form>
          {canPublish ? (
            <form action={publishAction}>
              {hiddenFields}
              <Button type="submit" data-testid="pm-publish">
                Publish
              </Button>
            </form>
          ) : (
            <p className="self-center text-sm text-zinc-600">A manager publishes this plan.</p>
          )}
        </div>
      ) : null}

      {plan && plan.status === "PUBLISHED" && !plan.hasSuccessorDraft && canDraft ? (
        <form
          action={() => {
            startTransition(async () => {
              const result = await createSuccessorDraftAction(departmentId, plan.id);
              if (result.ok) router.refresh();
            });
          }}
        >
          <Button type="submit" variant="secondary" loading={pending} data-testid="pm-edit-plan">
            Edit Plan
          </Button>
        </form>
      ) : null}

      {plan && plan.status === "PUBLISHED" && canRetire ? (
        <div className="rounded-lg border border-zinc-200 px-4 py-4">
          <h2 className="text-base font-semibold text-zinc-900">Retire PM Plan</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Future preventive maintenance will no longer be generated. Existing Work Orders and PM
            history remain.
          </p>
          {retireOpen ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="destructive"
                data-testid="pm-retire-confirm"
                onClick={() => {
                  startTransition(async () => {
                    const result = await retirePmPlanAction(departmentId, plan.id);
                    if (result.ok) router.refresh();
                  });
                }}
                loading={pending}
              >
                Confirm retire
              </Button>
              <Button variant="ghost" onClick={() => setRetireOpen(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              className="mt-3"
              variant="secondary"
              data-testid="pm-retire"
              onClick={() => setRetireOpen(true)}
            >
              Retire PM Plan
            </Button>
          )}
        </div>
      ) : null}

      {plan && plan.history.length > 0 ? (
        <section className="space-y-2" data-testid="pm-version-history">
          <h2 className="text-base font-semibold text-zinc-900">Version history</h2>
          <p className="text-sm text-zinc-600">
            Published configuration is historical and read-only. Superseded versions stay available
            for audit.
          </p>
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Version</th>
                <th className="py-1 pr-3 font-medium">Status</th>
                <th className="py-1 pr-3 font-medium">Effective</th>
                <th className="py-1 pr-3 font-medium">Published</th>
                <th className="py-1 pr-3 font-medium">Cadence</th>
                <th className="py-1 font-medium">Procedure</th>
              </tr>
            </thead>
            <tbody>
              {plan.history.map((row) => (
                <tr key={row.id} data-testid={`pm-history-v${row.version}`}>
                  <td className="py-1 pr-3">v{row.version}</td>
                  <td className="py-1 pr-3">
                    <StatusBadge
                      variant={
                        row.status === "PUBLISHED"
                          ? "success"
                          : row.status === "SUPERSEDED"
                            ? "neutral"
                            : "in_progress"
                      }
                    >
                      {versionStatusLabel(row.status)}
                    </StatusBadge>
                  </td>
                  <td className="py-1 pr-3">
                    {row.effectiveDate
                      ? formatProjectedDateLabel(row.effectiveDate, { includeYear: true })
                      : "—"}
                  </td>
                  <td className="py-1 pr-3">
                    {row.publishedAt ? row.publishedAt.slice(0, 10) : "—"}
                  </td>
                  <td className="py-1 pr-3">{row.cadenceSummary}</td>
                  <td className="py-1">{row.procedureLabel ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

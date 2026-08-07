import {
  createCycleDraftAction,
  duplicateCycleAction,
  generateDietaryDefaultsAction,
  generateEvsDefaultsAction,
  publishCycleAction,
  reorderCycleDraftsAction,
  retireCycleAction,
  updateCycleDraftAction,
} from "@/app/(protected)/admin/departments/[departmentId]/cycle-actions";
import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import { AppCard, SectionHeader, StatusBadge } from "@/components/design-system";
import type { AppJwtPayload } from "@/lib/auth";
import {
  loadCycleBuilder,
  validateCycle,
  type CycleBuilderRow,
} from "@/lib/operational-cycles";
import { getFacilityServiceDate, loadFacilityTimezone, toServiceDateKey } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

type Props = {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  departmentName: string;
  departmentKey?: string;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function cycleStatusVariant(
  status: CycleBuilderRow["status"],
): "neutral" | "success" | "warning" {
  switch (status) {
    case "DRAFT":
      return "neutral";
    case "PUBLISHED":
      return "success";
    case "RETIRED":
      return "warning";
  }
}

function draftValidationErrors(row: CycleBuilderRow): string[] {
  const result = validateCycle({
    label: row.label,
    cycleType: row.cycleType,
    startLocal: row.startLocal,
    endLocal: row.endLocal,
    overnight: row.overnight,
    applicableDaysOfWeek: row.applicableDaysOfWeek,
    effectiveFrom: toServiceDateKey(row.effectiveFrom),
    mealType: row.mealType,
    locationMode: row.locationMode,
    applicableUnitTypes: row.applicableUnitTypes,
    unitIds: row.unitIds,
    expectedMilestones: row.expectedMilestones,
    forPublish: true,
  });
  return result.errors.map((e) => e.message);
}

function CycleFieldGrid({
  defaults,
  idPrefix,
}: {
  defaults?: Partial<{
    label: string;
    description: string;
    cycleType: string;
    displaySequence: number;
    startLocal: string;
    endLocal: string;
    overnight: boolean;
    applicableDaysOfWeek: number[];
    effectiveFrom: string;
    effectiveTo: string | null;
    mealType: string | null;
    locationMode: string;
    applicableUnitTypes: string[];
    expectedMilestones: string[];
  }>;
  idPrefix: string;
}) {
  const days = defaults?.applicableDaysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
  const milestones = defaults?.expectedMilestones ?? [];
  const unitTypes = defaults?.applicableUnitTypes ?? ["SERVERY", "KITCHEN"];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
        Label
        <input
          id={`${idPrefix}-label`}
          name="label"
          required
          defaultValue={defaults?.label ?? ""}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
        Description
        <input
          name="description"
          defaultValue={defaults?.description ?? ""}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs font-medium text-zinc-700">
        Type
        <select
          name="cycleType"
          required
          defaultValue={defaults?.cycleType ?? "PREPARATION"}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="PREPARATION">Preparation</option>
          <option value="SERVICE">Service</option>
          <option value="TRANSITION">Transition</option>
          <option value="CLOSEOUT">Closeout</option>
          <option value="CUSTOM">Custom</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-zinc-700">
        Sequence
        <input
          name="displaySequence"
          type="number"
          min={0}
          defaultValue={defaults?.displaySequence ?? 100}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs font-medium text-zinc-700">
        Start (HH:mm)
        <input
          name="startLocal"
          required
          pattern="\d{1,2}:\d{2}"
          placeholder="05:30"
          defaultValue={defaults?.startLocal ?? ""}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs font-medium text-zinc-700">
        End (HH:mm)
        <input
          name="endLocal"
          required
          pattern="\d{1,2}:\d{2}"
          placeholder="07:30"
          defaultValue={defaults?.endLocal ?? ""}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
        <input
          type="checkbox"
          name="overnight"
          value="true"
          defaultChecked={defaults?.overnight ?? false}
          className="rounded border-zinc-300"
        />
        Overnight window
      </label>
      <label className="block text-xs font-medium text-zinc-700">
        Meal type
        <select
          name="mealType"
          defaultValue={defaults?.mealType ?? ""}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">None</option>
          <option value="BREAKFAST">Breakfast</option>
          <option value="LUNCH">Lunch</option>
          <option value="DINNER">Dinner</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-zinc-700">
        Effective from
        <input
          name="effectiveFrom"
          type="date"
          required
          defaultValue={defaults?.effectiveFrom ?? ""}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs font-medium text-zinc-700">
        Effective to (optional)
        <input
          name="effectiveTo"
          type="date"
          defaultValue={defaults?.effectiveTo ?? ""}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs font-medium text-zinc-700">
        Location mode
        <select
          name="locationMode"
          defaultValue={defaults?.locationMode ?? "UNIT_TYPES"}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="ALL_DEPARTMENT_UNITS">All department units</option>
          <option value="UNIT_TYPES">Unit types</option>
          <option value="EXPLICIT_UNITS">Explicit units</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-zinc-700">
        Unit types (comma-separated)
        <input
          name="applicableUnitTypes"
          defaultValue={unitTypes.join(",")}
          placeholder="SERVERY,KITCHEN"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
        Days of week (0=Sun … 6=Sat, comma-separated)
        <input
          name="applicableDaysOfWeek"
          defaultValue={days.join(",")}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        />
        <span className="mt-1 block text-[11px] font-normal text-zinc-500">
          {days.map((d) => DAY_LABELS[d] ?? d).join(", ")}
        </span>
      </label>
      <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
        Expected milestones (SERVICE cycles)
        <input
          name="expectedMilestones"
          defaultValue={milestones.join(",")}
          placeholder="READY,SERVICE_STARTED"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
    </div>
  );
}

function CycleRowActions({
  row,
  departmentId,
  canManage,
  canPublish,
}: {
  row: CycleBuilderRow;
  departmentId: string;
  canManage: boolean;
  canPublish: boolean;
}) {
  const publishErrors = row.status === "DRAFT" ? draftValidationErrors(row) : [];

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {canManage && row.status === "DRAFT" ? (
        <details className="w-full rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <summary className="cursor-pointer text-xs font-medium text-zinc-800">
            Edit draft
          </summary>
          <DepartmentAdminActionForm
            action={updateCycleDraftAction}
            className="mt-3 space-y-3"
          >
            <input type="hidden" name="departmentId" value={departmentId} />
            <input type="hidden" name="cycleId" value={row.id} />
            <CycleFieldGrid
              idPrefix={`edit-${row.id}`}
              defaults={{
                label: row.label,
                description: row.description ?? "",
                cycleType: row.cycleType,
                displaySequence: row.displaySequence,
                startLocal: row.startLocal,
                endLocal: row.endLocal,
                overnight: row.overnight,
                applicableDaysOfWeek: row.applicableDaysOfWeek,
                effectiveFrom: toServiceDateKey(row.effectiveFrom),
                effectiveTo: row.effectiveTo ? toServiceDateKey(row.effectiveTo) : null,
                mealType: row.mealType,
                locationMode: row.locationMode,
                applicableUnitTypes: row.applicableUnitTypes,
                expectedMilestones: row.expectedMilestones,
              }}
            />
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
            >
              Save draft
            </button>
          </DepartmentAdminActionForm>
        </details>
      ) : null}

      {canManage ? (
        <DepartmentAdminActionForm action={duplicateCycleAction}>
          <input type="hidden" name="departmentId" value={departmentId} />
          <input type="hidden" name="cycleId" value={row.id} />
          <button
            type="submit"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Duplicate
          </button>
        </DepartmentAdminActionForm>
      ) : null}

      {canPublish && row.status === "DRAFT" ? (
        <DepartmentAdminActionForm action={publishCycleAction}>
          <input type="hidden" name="departmentId" value={departmentId} />
          <input type="hidden" name="cycleId" value={row.id} />
          <button
            type="submit"
            disabled={publishErrors.length > 0}
            title={
              publishErrors.length > 0
                ? publishErrors.join(" ")
                : "Publish this draft"
            }
            className="rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Publish
          </button>
        </DepartmentAdminActionForm>
      ) : null}

      {canManage && row.status === "PUBLISHED" ? (
        <DepartmentAdminActionForm action={retireCycleAction}>
          <input type="hidden" name="departmentId" value={departmentId} />
          <input type="hidden" name="cycleId" value={row.id} />
          <button
            type="submit"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            Retire
          </button>
        </DepartmentAdminActionForm>
      ) : null}

      {publishErrors.length > 0 ? (
        <ul
          className="w-full list-disc space-y-0.5 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800"
          data-testid="cycle-publish-errors"
        >
          {publishErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CycleListSection({
  title,
  rows,
  departmentId,
  canManage,
  canPublish,
  empty,
}: {
  title: string;
  rows: CycleBuilderRow[];
  departmentId: string;
  canManage: boolean;
  canPublish: boolean;
  empty: string;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-900">
        {title}{" "}
        <span className="font-normal text-zinc-500">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} data-testid="cycle-row">
              <AppCard
                title={row.label}
                subtitle={`${row.startLocal}–${row.endLocal} · ${row.cycleType}${
                  row.mealType ? ` · ${row.mealType}` : ""
                } · seq ${row.displaySequence} · v${row.version}`}
                actions={
                  <StatusBadge variant={cycleStatusVariant(row.status)}>
                    {row.status}
                  </StatusBadge>
                }
              >
                {row.description ? (
                  <p className="text-sm text-zinc-600">{row.description}</p>
                ) : null}
                <p className="mt-1 text-xs text-zinc-500">
                  Location: {row.locationMode.replaceAll("_", " ").toLowerCase()}
                  {row.applicableUnitTypes.length > 0
                    ? ` · ${row.applicableUnitTypes.join(", ")}`
                    : ""}
                  {row.expectedMilestones.length > 0
                    ? ` · milestones ${row.expectedMilestones.join(", ")}`
                    : ""}
                </p>
                <CycleRowActions
                  row={row}
                  departmentId={departmentId}
                  canManage={canManage}
                  canPublish={canPublish}
                />
              </AppCard>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export async function CyclesPanel({
  session,
  facilityId,
  departmentId,
  departmentName,
  departmentKey,
}: Props) {
  const timezone = await loadFacilityTimezone(prisma, facilityId);
  const previewDateKey = toServiceDateKey(getFacilityServiceDate(timezone, new Date()));

  const builder = await loadCycleBuilder({
    session,
    facilityId,
    departmentId,
    previewDateKey,
  });

  const drafts = builder.cycles.filter((c) => c.status === "DRAFT");
  const published = builder.cycles.filter((c) => c.status === "PUBLISHED");
  const retired = builder.cycles.filter((c) => c.status === "RETIRED");
  const draftOrder = [...drafts]
    .sort((a, b) => a.displaySequence - b.displaySequence || a.label.localeCompare(b.label))
    .map((d) => d.id);
  const isEvs = departmentKey === "EVS";

  return (
    <div className="space-y-6" data-testid="operational-cycles-panel">
      <SectionHeader
        title="Operational Cycles"
        description={`Named phases of the ${departmentName} operating day. Published cycles drive runtime context; drafts stay in Builder until reviewed.`}
      />

      <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
        Phase 9A does not implement Job Flow. Overlapping published cycles are not
        supported — resolve overlaps before publish.
      </p>

      <AppCard title="Day preview" subtitle={`Facility-local ${previewDateKey}`}>
        <p className="text-sm text-zinc-600">{builder.preview.description}</p>
        <ul className="mt-3 space-y-1" data-testid="cycle-day-preview">
          {builder.preview.cycles.length === 0 ? (
            <li className="text-sm text-zinc-500">No published cycles for this date.</li>
          ) : (
            builder.preview.cycles.map((cycle) => (
              <li key={cycle.id} className="text-sm text-zinc-800">
                {cycle.startLocal}–{cycle.endLocal} {cycle.label}
              </li>
            ))
          )}
        </ul>
      </AppCard>

      {builder.canManage ? (
        <div className="flex flex-wrap gap-3">
          {isEvs ? (
            <DepartmentAdminActionForm action={generateEvsDefaultsAction}>
              <input type="hidden" name="departmentId" value={departmentId} />
              <input type="hidden" name="effectiveFrom" value={previewDateKey} />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                data-testid="generate-evs-defaults"
              >
                Generate EVS defaults
              </button>
            </DepartmentAdminActionForm>
          ) : (
            <DepartmentAdminActionForm action={generateDietaryDefaultsAction}>
              <input type="hidden" name="departmentId" value={departmentId} />
              <input type="hidden" name="effectiveFrom" value={previewDateKey} />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                data-testid="generate-dietary-defaults"
              >
                Generate Dietary defaults
              </button>
            </DepartmentAdminActionForm>
          )}
          {drafts.length > 1 ? (
            <DepartmentAdminActionForm action={reorderCycleDraftsAction} className="space-y-2">
              <input type="hidden" name="departmentId" value={departmentId} />
              <label className="block text-xs font-medium text-zinc-700">
                Reorder drafts (comma-separated ids by desired sequence)
                <input
                  name="orderedCycleIds"
                  defaultValue={draftOrder.join(",")}
                  className="mt-1 block min-w-[16rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm font-normal"
                  data-testid="reorder-cycle-ids"
                />
              </label>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Apply order
              </button>
            </DepartmentAdminActionForm>
          ) : null}
        </div>
      ) : null}

      {!builder.canManage ? (
        <p className="text-sm text-zinc-600">
          View-only. Managers with password auth can create and publish cycles.
          Quick PIN cannot manage Operational Cycles.
        </p>
      ) : null}

      {builder.canManage ? (
        <AppCard title="Create draft" subtitle="New cycles start as Draft for review.">
          <DepartmentAdminActionForm
            action={createCycleDraftAction}
            className="space-y-3"
          >
            <div data-testid="create-cycle-form" className="space-y-3">
              <input type="hidden" name="departmentId" value={departmentId} />
              <CycleFieldGrid
                idPrefix="create"
                defaults={{
                  effectiveFrom: previewDateKey,
                  locationMode: "UNIT_TYPES",
                  applicableUnitTypes: isEvs
                    ? ["RESIDENT_AREA", "COMMON_AREA", "EVS_ZONE", "RESTROOM_CLUSTER"]
                    : ["SERVERY", "KITCHEN"],
                  applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
                }}
              />
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Create draft
              </button>
            </div>
          </DepartmentAdminActionForm>
        </AppCard>
      ) : null}

      <CycleListSection
        title="Draft"
        rows={drafts}
        departmentId={departmentId}
        canManage={builder.canManage}
        canPublish={builder.canPublish}
        empty="No draft cycles."
      />
      <CycleListSection
        title="Published"
        rows={published}
        departmentId={departmentId}
        canManage={builder.canManage}
        canPublish={builder.canPublish}
        empty="No published cycles yet."
      />
      <CycleListSection
        title="Retired"
        rows={retired}
        departmentId={departmentId}
        canManage={builder.canManage}
        canPublish={builder.canPublish}
        empty="No retired cycles."
      />
    </div>
  );
}

import {
  createCycleDraftAction,
  duplicateCycleAction,
  generateDietaryDefaultsAction,
  generateEvsDefaultsAction,
  scheduleCycleChangesAction,
} from "@/app/(protected)/admin/departments/[departmentId]/cycle-actions";
import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import {
  AddCycleToggle,
  CycleEditorFields,
} from "@/app/(protected)/admin/departments/[departmentId]/cycles-builder-controls";
import { CyclesReviewPublishPanel } from "@/app/(protected)/admin/departments/[departmentId]/cycles-review-publish";
import { CycleRowActionsMenu } from "@/app/(protected)/admin/departments/[departmentId]/cycle-row-actions-menu";
import { DiscardAllDraftsButton } from "@/app/(protected)/admin/departments/[departmentId]/discard-all-drafts-button";
import {
  CompactCycleReadonlyList,
  CompactDraftList,
} from "@/app/(protected)/admin/departments/[departmentId]/cycles-tree-list";
import type { AppJwtPayload } from "@/lib/auth";
import {
  buildDietaryStarterPreview,
  departmentHasCycleConfiguration,
  dietaryStarterWouldCreateCount,
  isImmediatePublishTestingOverrideEnabled,
  latestDraftEditedAt,
  latestDraftsByStableKey,
  loadCycleBuilder,
  minimumPublishEffectiveFrom,
  nextOperationalDayKey,
  partitionCyclesForLifecycle,
  reviewDraftChangesAgainstCurrent,
  type CycleBuilderRow,
} from "@/lib/operational-cycles";
import {
  collectExistingCycleIdentity,
  formatServiceDateLong,
} from "@/lib/operational-cycles/cycle-display";
import {
  isTrueCycleFirstSetup,
  shouldShowCycleCurrentSection,
  shouldShowCycleDraftSection,
  shouldShowCycleHistorySection,
  shouldShowCycleScheduledSection,
} from "@/lib/operational-cycles/cycle-ui";
import { presentHierarchicalCycleReview } from "@/lib/operational-cycles/present-hierarchical-review";
import { validateDraftsForReviewPublish } from "@/lib/operational-cycles/review-publish-validation";
import { getFacilityServiceDate, loadFacilityTimezone, toServiceDateKey } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

type Props = {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  departmentName: string;
  departmentKey?: string;
};

function toRowData(row: CycleBuilderRow) {
  return {
    id: row.id,
    label: row.label,
    nodeKind: row.nodeKind,
    startLocal: row.startLocal,
    endLocal: row.endLocal,
    mealType: row.mealType,
    applicableDaysOfWeek: row.applicableDaysOfWeek,
    description: row.description,
    cycleType: row.cycleType,
    displaySequence: row.displaySequence,
    overnight: row.overnight,
    effectiveFrom: toServiceDateKey(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? toServiceDateKey(row.effectiveTo) : null,
    locationMode: row.locationMode,
    locationInheritFromParent: row.locationInheritFromParent,
    applicableUnitTypes: row.applicableUnitTypes,
    applicableOperationalTypeKeys: row.applicableOperationalTypeKeys ?? [],
    expectedMilestones: row.expectedMilestones,
    roomTypeKey: row.roomTypeKey,
    unitIds: row.unitIds,
    spaceIds: row.spaceIds,
    keyTimeGroups: row.keyTimeGroups,
    milestoneTimes: row.milestoneTimes,
    status: row.status,
    stableKey: row.stableKey,
    parentStableKey: row.parentStableKey,
  };
}

export async function CyclesPanel({
  session,
  facilityId,
  departmentId,
  departmentName,
  departmentKey,
}: Props) {
  const timezone = await loadFacilityTimezone(prisma, facilityId);
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, new Date()));
  const nextDay = nextOperationalDayKey(todayKey);

  const builder = await loadCycleBuilder({
    session,
    facilityId,
    departmentId,
    previewDateKey: todayKey,
  });

  const { current, drafts, scheduled, history, currentEffectiveSince } =
    partitionCyclesForLifecycle(builder.cycles, todayKey);

  const presence = {
    currentCount: current.length,
    draftCount: drafts.length,
    scheduledCount: scheduled.length,
    historyCount: history.length,
  };
  const firstSetup = isTrueCycleFirstSetup(presence);
  const locationNames = Object.fromEntries(
    builder.catalog.locations.map((location) => [location.id, location.name]),
  );
  const reviewChanges = reviewDraftChangesAgainstCurrent({
    drafts,
    current,
    locationNames,
    unitNames: locationNames,
  });
  const hierarchicalReview = presentHierarchicalCycleReview({
    changes: reviewChanges,
    drafts,
    currentCount: current.length,
    locationNames,
  });
  const authorizedSpaceIds = new Set(builder.catalog.locations.map((location) => location.id));
  const publishedForReview = latestDraftsByStableKey(
    builder.cycles.filter((cycle) => cycle.status === "PUBLISHED"),
  );
  const reviewValidation = validateDraftsForReviewPublish({
    drafts,
    locationContext: publishedForReview,
    locationNames,
    authorizedSpaceIds,
  });
  const draftEditedAt = latestDraftEditedAt(drafts);
  const isEvs = departmentKey === "EVS";
  const isDietary = departmentKey === "DIETARY";
  const showMeal = isDietary;
  const scheduledEffective =
    scheduled.length > 0 ? toServiceDateKey(scheduled[0]!.effectiveFrom) : null;
  const minScheduleDate = minimumPublishEffectiveFrom({
    todayKey,
    hasCurrentEffectiveConfig: current.length > 0,
  });
  // Testing override: visible in development/test only — not production builds.
  const allowImmediatePublish = isImmediatePublishTestingOverrideEnabled();

  const existingIdentity = collectExistingCycleIdentity(builder.cycles);
  const hasConfig = departmentHasCycleConfiguration(presence);
  const dietaryStarterMissing = isDietary
    ? dietaryStarterWouldCreateCount(existingIdentity.stableKeys)
    : 0;
  const dietaryStarterPreview = isDietary ? buildDietaryStarterPreview() : [];
  const showDietaryStarterPrimary =
    builder.canManage && isDietary && firstSetup;
  const showDietaryStarterSecondary =
    builder.canManage && isDietary && hasConfig && dietaryStarterMissing > 0;

  return (
    <div className="space-y-3" data-testid="operational-cycles-panel">
      <div
        className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
        data-testid="operational-cycles-header"
      >
        <div className="min-w-0 space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">Operational Cycles</h2>
          <p className="text-sm text-zinc-600">
            Define recurring periods, phases, and key times that shape {departmentName}&apos;s
            operating day.
          </p>
        </div>
      </div>

      {firstSetup ? (
        <div
          className="rounded-lg border border-zinc-200 bg-white px-4 py-5"
          data-testid="operational-cycles-empty"
        >
          <p className="text-sm text-zinc-700">No operational cycles yet.</p>
          <p className="mt-1 text-sm text-zinc-500">
            {isDietary
              ? "Start with a Dietary example operating day, or create one from scratch."
              : "Create the recurring operating periods this department uses."}
          </p>
          {showDietaryStarterPrimary ? (
            <div className="mt-4 space-y-3" data-testid="dietary-starter-preview">
              <p className="text-sm font-medium text-zinc-900">Start with a Dietary example</p>
              <p className="text-xs text-zinc-500">
                Creates a basic Breakfast / Lunch / Dinner structure with common phases. You can
                rename, move, add, or remove anything afterward.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {dietaryStarterPreview.map((root) => (
                  <div key={root.stableKey} className="text-sm text-zinc-700">
                    <p className="font-medium text-zinc-900">{root.label}</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
                      {root.children.map((child) => (
                        <li key={child.stableKey}>· {child.label}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <DepartmentAdminActionForm action={generateDietaryDefaultsAction}>
                <input type="hidden" name="departmentId" value={departmentId} />
                <input type="hidden" name="effectiveFrom" value={nextDay} />
                <button
                  type="submit"
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
                  data-testid="generate-dietary-defaults"
                >
                  Add starter cycles
                </button>
              </DepartmentAdminActionForm>
            </div>
          ) : null}
          {!builder.canManage ? (
            <p className="mt-3 text-xs text-zinc-500">
              Managers with password auth can create operational cycles.
            </p>
          ) : null}
        </div>
      ) : null}

      {builder.canManage ? (
        <AddCycleToggle defaultOpen={firstSetup}>
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
            <p className="text-xs text-zinc-500">
              Create a major operating period. Changes start as Draft.
            </p>
            <DepartmentAdminActionForm action={createCycleDraftAction} className="mt-3 space-y-3">
              <div data-testid="create-cycle-form" className="space-y-3">
                <input type="hidden" name="departmentId" value={departmentId} />
                <CycleEditorFields
                  idPrefix="create"
                  showMeal={showMeal}
                  compactCreate
                  catalog={builder.catalog}
                  parentOptions={builder.cycles
                    .filter((c) => c.status === "DRAFT" || c.status === "PUBLISHED")
                    .map((c) => ({
                      stableKey: c.stableKey,
                      label: c.label,
                      displayPath: c.label,
                    }))}
                  defaults={{
                    effectiveFrom: nextDay,
                    cycleType: isDietary ? "CUSTOM" : "CUSTOM",
                    locationMode: "OPERATIONAL_TYPES",
                    roomTypeKey: null,
                    applicableUnitTypes: [],
                    applicableOperationalTypeKeys: [],
                    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
                    expectedMilestones: [],
                    parentStableKey: null,
                    mealType: showMeal ? "BREAKFAST" : null,
                  }}
                />
                <button
                  type="submit"
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
                  data-testid="create-cycle-submit"
                >
                  Save draft
                </button>
              </div>
            </DepartmentAdminActionForm>
          </div>
        </AddCycleToggle>
      ) : null}

      {shouldShowCycleDraftSection(presence) ? (
        <section
          className="space-y-3 rounded-lg border border-amber-200/60 bg-amber-50/40 px-3 py-3"
          data-testid="cycles-draft"
        >
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              Draft
              {hierarchicalReview.mode === "empty" ? (
                <span className="font-normal text-zinc-500"> · No changes</span>
              ) : (
                <span className="font-normal text-zinc-500">
                  {" "}
                  · {drafts.length} change{drafts.length === 1 ? "" : "s"}
                </span>
              )}
            </h3>
            <p className="mt-1 text-xs text-zinc-600">
              Not active yet. Today’s operation continues to use the current configuration.
            </p>
            {draftEditedAt ? (
              <p className="mt-0.5 text-xs text-zinc-500">
                Last edited {formatServiceDateLong(toServiceDateKey(draftEditedAt))}.
              </p>
            ) : null}
            {hierarchicalReview.mode === "empty" ? (
              <p className="mt-1 text-xs text-zinc-600" data-testid="draft-matches-current">
                This draft matches Current.
              </p>
            ) : null}
          </div>
          {builder.canManage && hierarchicalReview.mode === "empty" ? (
            <DiscardAllDraftsButton departmentId={departmentId} hasChanges={false} />
          ) : null}
          {builder.canManage ? (
            <CompactDraftList
              departmentId={departmentId}
              rows={drafts.map(toRowData)}
              parentContext={current.map(toRowData)}
              showMeal={showMeal}
              canReorder={drafts.length > 1}
              catalog={builder.catalog}
              nextDayKey={nextDay}
            />
          ) : (
            <CompactCycleReadonlyList
              rows={drafts.map(toRowData)}
              showMeal={showMeal}
              catalog={builder.catalog}
            />
          )}

          {builder.canPublish ? (
            <CyclesReviewPublishPanel
              departmentId={departmentId}
              todayKey={todayKey}
              nextDayKey={nextDay}
              minDateKey={minScheduleDate}
              allowImmediate={allowImmediatePublish}
              scheduleAction={scheduleCycleChangesAction}
              blockers={reviewValidation.blockers}
              warnings={reviewValidation.warnings}
              hierarchicalReview={hierarchicalReview}
            />
          ) : null}
        </section>
      ) : null}

      {shouldShowCycleCurrentSection(presence) ? (
        <section className="space-y-2" data-testid="cycles-current">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">Current configuration</h3>
            {currentEffectiveSince ? (
              <p className="text-xs text-zinc-500">
                Effective since {formatServiceDateLong(currentEffectiveSince)}
              </p>
            ) : null}
          </div>
          <p className="text-xs text-zinc-500">What Run is using today.</p>
          <CompactCycleReadonlyList
            rows={current.map(toRowData)}
            showMeal={showMeal}
            catalog={builder.catalog}
            editDraftIdByStableKey={Object.fromEntries(drafts.map((row) => [row.stableKey, row.id]))}
            actionsById={
              builder.canManage
                ? Object.fromEntries(
                    current.map((row) => [
                      row.id,
                      <div key={row.id} className="flex items-center gap-1">
                        <div className="hidden" data-cycle-edit={row.id}>
                          <DepartmentAdminActionForm
                            action={duplicateCycleAction}
                            openCycleEditorOnSuccess
                          >
                            <input type="hidden" name="departmentId" value={departmentId} />
                            <input type="hidden" name="cycleId" value={row.id} />
                            <button type="submit" data-testid="duplicate-as-draft">
                              Edit
                            </button>
                          </DepartmentAdminActionForm>
                        </div>
                        <CycleRowActionsMenu
                          departmentId={departmentId}
                          cycleId={row.id}
                          objectLabel={row.label}
                          ariaLabel={`Actions for ${row.label}`}
                          actions={["edit-current", "retire-current"]}
                        />
                      </div>,
                    ]),
                  )
                : undefined
            }
          />
        </section>
      ) : null}

      {shouldShowCycleScheduledSection(presence) ? (
        <section className="space-y-2" data-testid="cycles-scheduled">
          <h3 className="text-sm font-semibold text-zinc-900">Scheduled changes</h3>
          <p className="text-xs text-zinc-500">
            Effective{" "}
            {scheduledEffective ? formatServiceDateLong(scheduledEffective) : "future date"} · not
            active yet
          </p>
          <CompactCycleReadonlyList
            rows={scheduled.map(toRowData)}
            showMeal={showMeal}
            catalog={builder.catalog}
            groupByScope
          />
        </section>
      ) : null}

      {shouldShowCycleHistorySection(presence) ? (
        <details className="space-y-2" data-testid="cycles-history">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
            History ({history.length})
          </summary>
          <CompactCycleReadonlyList
            rows={history.map(toRowData)}
            showMeal={showMeal}
            catalog={builder.catalog}
            groupByScope
          />
        </details>
      ) : null}

      {showDietaryStarterSecondary ? (
        <details
          className="rounded-lg border border-zinc-200 bg-white px-4 py-3"
          data-testid="dietary-starter-secondary"
        >
          <summary className="cursor-pointer text-sm font-medium text-zinc-900">
            Add from Dietary starter
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-zinc-500">
              Adds any missing Breakfast / Lunch / Dinner starter phases as Draft. Existing cycles
              are left unchanged.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {dietaryStarterPreview.map((root) => (
                <div key={root.stableKey} className="text-sm text-zinc-700">
                  <p className="font-medium text-zinc-900">{root.label}</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
                    {root.children.map((child) => (
                      <li key={child.stableKey}>· {child.label}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <DepartmentAdminActionForm action={generateDietaryDefaultsAction}>
              <input type="hidden" name="departmentId" value={departmentId} />
              <input type="hidden" name="effectiveFrom" value={nextDay} />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                data-testid="generate-dietary-defaults"
              >
                Add starter cycles
              </button>
            </DepartmentAdminActionForm>
          </div>
        </details>
      ) : null}

      {builder.canManage && isEvs && (firstSetup || drafts.length < 4) ? (
        <DepartmentAdminActionForm action={generateEvsDefaultsAction}>
          <input type="hidden" name="departmentId" value={departmentId} />
          <input type="hidden" name="effectiveFrom" value={nextDay} />
          <button
            type="submit"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            data-testid="generate-evs-defaults"
          >
            {firstSetup ? "Start with EVS example" : "Add from EVS example"}
          </button>
        </DepartmentAdminActionForm>
      ) : null}
    </div>
  );
}

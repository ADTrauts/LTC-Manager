"use client";

import { useState } from "react";

import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import { CycleEditorFields } from "@/app/(protected)/admin/departments/[departmentId]/cycles-builder-controls";
import {
  applyProductCycleStarterAction,
  makeOperatingRhythmLiveAction,
  updateCycleDraftAction,
} from "@/app/(protected)/admin/departments/[departmentId]/cycle-actions";
import { Button } from "@/components/design-system/Button";
import { KeyTimeGroupsEditor } from "@/components/operational-cycles/room-picker";
import type {
  OperatingRhythmChildView,
  OperatingRhythmRootView,
} from "@/lib/department-administration/operating-rhythm";
import type { ResolvedCycleStarter } from "@/lib/department-products/cycle-starter";
import type { CycleBuilderCatalog } from "@/lib/operational-cycles/load-cycle-builder";
import { formatCycleClock } from "@/lib/operational-cycles/cycle-display";

type Props = {
  departmentId: string;
  starter: ResolvedCycleStarter | null;
  starterWouldCreate: number;
  roots: OperatingRhythmRootView[];
  catalog: CycleBuilderCatalog;
  canManage: boolean;
  canPublish: boolean;
  showMeal: boolean;
  nextDayKey: string;
  allowImmediateTesting: boolean;
};

export function OperatingRhythmPanel({
  departmentId,
  starter,
  starterWouldCreate,
  roots,
  catalog,
  canManage,
  canPublish,
  showMeal,
  nextDayKey,
  allowImmediateTesting,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKeyPointId, setEditingKeyPointId] = useState<string | null>(null);
  const draftCount = roots.filter((root) => root.draftCycleId).length;
  const showStarter = Boolean(canManage && starter && starterWouldCreate > 0);

  return (
    <section
      className="space-y-3 rounded-lg border border-zinc-200 bg-white px-4 py-4"
      data-testid="operating-rhythm-panel"
    >
      <div>
        <h2 className="text-base font-semibold text-zinc-900">Operating Rhythm</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Operational Cycles, one level of Phases, and Key Points. Planned times stay on the Cycle.
          Adjusting today happens in Run.
        </p>
      </div>

      {showStarter && starter ? (
        <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3" data-testid="cycle-starter-offer">
          <p className="text-sm font-medium text-zinc-900">{starter.actionLabel}</p>
          <p className="text-xs text-zinc-600">{starter.explanation}</p>
          {starter.preview.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3" data-testid="cycle-starter-preview">
              {starter.preview.map((root) => (
                <div key={root.stableKey} className="text-sm text-zinc-700">
                  <p className="font-medium text-zinc-900">{root.label}</p>
                  {root.children.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
                      {root.children.map((child) => (
                        <li key={child.stableKey}>· {child.label}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          <DepartmentAdminActionForm action={applyProductCycleStarterAction}>
            <input type="hidden" name="departmentId" value={departmentId} />
            <input type="hidden" name="effectiveFrom" value={nextDayKey} />
            <Button type="submit" size="compact" data-testid="apply-cycle-starter">
              {starter.actionLabel}
            </Button>
          </DepartmentAdminActionForm>
        </div>
      ) : null}

      {roots.length === 0 && !showStarter ? (
        <p className="text-sm text-zinc-500" data-testid="operating-rhythm-empty">
          {starter
            ? "No operating periods yet."
            : "This Department Product does not use a Vssyl operating rhythm."}
        </p>
      ) : null}

      {roots.length > 0 ? (
        <ul className="space-y-3" data-testid="operating-rhythm-list">
          {roots.map((root) => (
            <li
              key={root.stableKey}
              className="rounded-md border border-zinc-200 px-3 py-2.5"
              data-testid="operating-rhythm-root"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900">{root.label}</p>
                  {root.liveWindow ? (
                    <p className="text-xs text-zinc-600" data-testid="rhythm-live">
                      Live {root.liveWindow}
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-500">Draft — not used in Run</p>
                  )}
                  {root.draftWindow && root.liveWindow ? (
                    <p className="text-xs text-amber-800" data-testid="rhythm-draft-changes">
                      Draft changes {root.draftWindow}
                    </p>
                  ) : root.draftWindow && !root.liveWindow ? (
                    <p className="text-xs text-zinc-600">{root.draftWindow}</p>
                  ) : null}
                  {root.scheduledEffectiveFrom ? (
                    <p className="text-xs text-zinc-500">
                      Scheduled for {root.scheduledEffectiveFrom}
                    </p>
                  ) : null}
                </div>
                {canManage && root.draftCycleId ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    onClick={() =>
                      setEditingId((current) =>
                        current === root.draftCycleId ? null : root.draftCycleId,
                      )
                    }
                  >
                    {editingId === root.draftCycleId ? "Close editor" : "Edit"}
                  </Button>
                ) : null}
              </div>
              {root.children.length > 0 ? (
                <ul className="mt-2 space-y-2 text-xs text-zinc-600">
                  {root.children.map((child) =>
                    child.nodeKind === "KEY_TIME" ? (
                      <li key={child.stableKey} data-testid="operating-rhythm-key-point">
                        <KeyPointLocations
                          rootLabel={root.label}
                          child={child}
                          departmentId={departmentId}
                          catalog={catalog}
                          canManage={canManage}
                          nextDayKey={nextDayKey}
                          open={editingKeyPointId === child.cycleId}
                          onToggle={() =>
                            setEditingKeyPointId((current) =>
                              current === child.cycleId ? null : child.cycleId,
                            )
                          }
                          onSaved={() => setEditingKeyPointId(null)}
                        />
                      </li>
                    ) : (
                      <li key={child.stableKey}>
                        {child.label}
                        {child.window ? ` · ${child.window}` : ""}
                        {child.status === "DRAFT" ? " · Draft" : ""}
                        {child.mealType ? ` · ${mealLabel(child.mealType)}` : ""}
                        {canManage &&
                        child.status === "DRAFT" &&
                        child.cycleType === "SERVICE" &&
                        !child.mealType ? (
                          <ServicePhaseMeal
                            child={child}
                            departmentId={departmentId}
                            suggestedMeal={root.mealType}
                            nextDayKey={nextDayKey}
                          />
                        ) : null}
                      </li>
                    ),
                  )}
                </ul>
              ) : null}
              {editingId === root.draftCycleId && root.draftCycleId ? (
                <DepartmentAdminActionForm
                  action={updateCycleDraftAction}
                  className="mt-3 space-y-3 border-t border-zinc-100 pt-3"
                  onSuccess={() => setEditingId(null)}
                >
                  <input type="hidden" name="departmentId" value={departmentId} />
                  <input type="hidden" name="cycleId" value={root.draftCycleId} />
                  <CycleEditorFields
                    idPrefix={`rhythm-edit-${root.stableKey}`}
                    showMeal={showMeal}
                    compactCreate
                    catalog={{
                      locations: catalog.locations,
                      roomTypes: catalog.roomTypes,
                    }}
                    defaults={{
                      label: root.label,
                      startLocal: root.draftStartLocal,
                      endLocal: root.draftEndLocal,
                      applicableDaysOfWeek: root.draftDays,
                      effectiveFrom: root.draftEffectiveFrom ?? nextDayKey,
                      effectiveTo: root.draftEffectiveTo,
                      description: root.draftDescription,
                      overnight: root.draftOvernight,
                      cycleType: root.draftCycleType,
                      locationMode: root.draftLocationMode,
                      unitIds: root.draftUnitIds,
                      spaceIds: root.draftSpaceIds,
                      parentStableKey: null,
                      mealType: showMeal ? root.mealType : null,
                    }}
                  />
                  <Button type="submit" size="compact">
                    Save period
                  </Button>
                </DepartmentAdminActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {canPublish && draftCount > 0 ? (
        <DepartmentAdminActionForm
          action={makeOperatingRhythmLiveAction}
          className="space-y-2 border-t border-zinc-100 pt-3"
        >
          <input type="hidden" name="departmentId" value={departmentId} />
          <p className="text-xs text-zinc-600">
            Make operating rhythm live so Run can use these periods. If a live rhythm already
            exists, changes take effect tomorrow.
          </p>
          {allowImmediateTesting ? (
            <label className="flex items-center gap-2 text-xs text-zinc-600">
              <input type="checkbox" name="activationMode" value="immediate" />
              <input type="hidden" name="confirmImmediate" value="1" />
              Make live today (testing)
            </label>
          ) : null}
          <Button type="submit" data-testid="make-operating-rhythm-live">
            Make operating rhythm live
          </Button>
        </DepartmentAdminActionForm>
      ) : null}
    </section>
  );
}

function locationName(catalog: CycleBuilderCatalog, spaceId: string): string {
  return catalog.locations.find((location) => location.id === spaceId)?.name ?? "Saved location";
}

function mealLabel(mealType: string): string {
  if (mealType === "BREAKFAST") return "Breakfast";
  if (mealType === "LUNCH") return "Lunch";
  if (mealType === "DINNER") return "Dinner";
  return mealType;
}

function ServicePhaseMeal({
  child,
  departmentId,
  suggestedMeal,
  nextDayKey,
}: {
  child: OperatingRhythmChildView;
  departmentId: string;
  suggestedMeal: string | null;
  nextDayKey: string;
}) {
  return (
    <DepartmentAdminActionForm action={updateCycleDraftAction} className="mt-2 space-y-2">
      <input type="hidden" name="departmentId" value={departmentId} />
      <input type="hidden" name="cycleId" value={child.cycleId} />
      <input type="hidden" name="label" value={child.label} />
      <input type="hidden" name="description" value={child.description ?? ""} />
      <input type="hidden" name="cycleType" value="SERVICE" />
      <input type="hidden" name="nodeKind" value="PERIOD" />
      <input type="hidden" name="startLocal" value={child.startLocal ?? ""} />
      <input type="hidden" name="endLocal" value={child.endLocal ?? ""} />
      <input
        type="hidden"
        name="applicableDaysOfWeek"
        value={child.applicableDaysOfWeek.join(",")}
      />
      <input type="hidden" name="effectiveFrom" value={child.effectiveFrom ?? nextDayKey} />
      <input type="hidden" name="parentStableKey" value={child.parentStableKey ?? ""} />
      <input type="hidden" name="locationMode" value={child.locationMode} />
      <input type="hidden" name="unitIds" value={child.unitIds.join(",")} />
      <input type="hidden" name="spaceIds" value={child.spaceIds.join(",")} />
      <input type="hidden" name="overnight" value={String(child.overnight)} />
      <input type="hidden" name="effectiveTo" value={child.effectiveTo ?? ""} />
      <input
        type="hidden"
        name="locationInheritFromParent"
        value={child.locationInheritFromParent ? "true" : "false"}
      />
      <label className="block text-xs font-medium text-zinc-700">
        Meal
        <select
          name="mealType"
          defaultValue={suggestedMeal ?? ""}
          className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          data-testid="service-phase-meal"
          required
        >
          <option value="" disabled>
            Choose a meal
          </option>
          <option value="BREAKFAST">Breakfast</option>
          <option value="LUNCH">Lunch</option>
          <option value="DINNER">Dinner</option>
        </select>
      </label>
      <p className="text-[11px] text-zinc-500">
        Choose the meal before publishing this Service phase.
      </p>
      <Button type="submit" size="compact" data-testid="save-service-phase-meal">
        Save meal
      </Button>
    </DepartmentAdminActionForm>
  );
}

function KeyPointLocations({
  rootLabel,
  child,
  departmentId,
  catalog,
  canManage,
  nextDayKey,
  open,
  onToggle,
  onSaved,
}: {
  rootLabel: string;
  child: OperatingRhythmChildView;
  departmentId: string;
  catalog: CycleBuilderCatalog;
  canManage: boolean;
  nextDayKey: string;
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const [groups, setGroups] = useState(child.keyTimeGroups);
  const editable = canManage && child.status === "DRAFT";
  const shown = open ? groups : child.keyTimeGroups;
  const missingRooms = shown.some((group) => group.spaceIds.length === 0);

  return (
    <div className="rounded-md bg-zinc-50 px-2 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-zinc-800">
            {rootLabel} → {child.label}
          </p>
          {shown.length === 0 ? (
            <p className="text-zinc-500">No due-time group yet.</p>
          ) : (
            <ul className="mt-1 space-y-0.5" data-testid="key-point-location-summary">
              {shown.map((group) => (
                <li key={`${child.stableKey}-${group.dueLocal}`}>
                  {formatCycleClock(group.dueLocal) || group.dueLocal || "Due time"}
                  {": "}
                  {group.spaceIds.length === 0
                    ? "No locations yet"
                    : group.spaceIds.map((spaceId) => locationName(catalog, spaceId)).join(", ")}
                </li>
              ))}
            </ul>
          )}
          {editable && missingRooms ? (
            <p className="mt-1 text-amber-800">
              Review cannot schedule this Key Point until each due-time group has a location.
            </p>
          ) : null}
        </div>
        {editable ? (
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() => {
              setGroups(child.keyTimeGroups);
              onToggle();
            }}
            data-testid="edit-key-point-locations"
          >
            {open ? "Close locations" : "Edit locations"}
          </Button>
        ) : null}
      </div>
      {open && editable ? (
        <DepartmentAdminActionForm
          action={updateCycleDraftAction}
          className="mt-2 space-y-2"
          onSuccess={onSaved}
        >
          <input type="hidden" name="departmentId" value={departmentId} />
          <input type="hidden" name="cycleId" value={child.cycleId} />
          <input type="hidden" name="label" value={child.label} />
          <input type="hidden" name="description" value={child.description ?? ""} />
          <input type="hidden" name="cycleType" value={child.cycleType} />
          <input type="hidden" name="nodeKind" value="KEY_TIME" />
          <input
            type="hidden"
            name="applicableDaysOfWeek"
            value={child.applicableDaysOfWeek.join(",")}
          />
          <input type="hidden" name="effectiveFrom" value={child.effectiveFrom ?? nextDayKey} />
          <input type="hidden" name="parentStableKey" value={child.parentStableKey ?? ""} />
          <input type="hidden" name="locationMode" value="EXPLICIT_UNITS" />
          <KeyTimeGroupsEditor
            locations={catalog.locations}
            groups={groups}
            onChange={setGroups}
            roomTypes={catalog.roomTypes}
          />
          <Button type="submit" size="compact" data-testid="save-key-point-locations">
            Save locations
          </Button>
        </DepartmentAdminActionForm>
      ) : null}
    </div>
  );
}

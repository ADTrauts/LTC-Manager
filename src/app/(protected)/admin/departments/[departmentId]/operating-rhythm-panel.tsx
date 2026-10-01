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
import type { OperatingRhythmRootView } from "@/lib/department-administration/operating-rhythm";
import type { ResolvedCycleStarter } from "@/lib/department-products/cycle-starter";
import type { TeamCatalog } from "@/lib/department-teams";

type Props = {
  departmentId: string;
  starter: ResolvedCycleStarter | null;
  starterWouldCreate: number;
  roots: OperatingRhythmRootView[];
  catalog: TeamCatalog;
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
  const draftCount = roots.filter((root) => root.draftCycleId).length;
  const showStarter = Boolean(canManage && starter && starterWouldCreate > 0);

  return (
    <section
      className="space-y-3 rounded-lg border border-zinc-200 bg-white px-4 py-4"
      data-testid="operating-rhythm-panel"
    >
      <div>
        <h2 className="text-base font-semibold text-zinc-900">Operating rhythm</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Recurring periods this department runs. Teams are optional and can share these periods.
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
                <ul className="mt-2 space-y-0.5 text-xs text-zinc-600">
                  {root.children.map((child) => (
                    <li key={`${root.stableKey}-${child.label}-${child.window}`}>
                      {child.label}
                      {child.window ? ` · ${child.window}` : ""}
                      {child.status === "DRAFT" ? " · Draft" : ""}
                    </li>
                  ))}
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
                      operationalTypes: catalog.operationalTypes,
                    }}
                    defaults={{
                      label: root.label,
                      startLocal: root.draftStartLocal,
                      endLocal: root.draftEndLocal,
                      applicableDaysOfWeek: root.draftDays,
                      effectiveFrom: root.draftEffectiveFrom ?? nextDayKey,
                      cycleType: "CUSTOM",
                      locationMode: root.draftLocationMode,
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

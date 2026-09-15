"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  collectDescendantResponsibilityTargets,
  formatApplyToDescendantsConfirm,
  formatStructuralBulkApplyConfirm,
  summarizeApplyScope,
} from "@/lib/facility-builder/department-responsibility-sync";
import type { UnitHierarchyNode } from "@/lib/facility-builder/load-facility-hierarchy";
import {
  applyBuilderUnitResponsibilitiesToDescendantsAction,
  applyDepartmentsToActionableDescendantsAction,
  setBuilderSpaceDepartmentsAction,
  setBuilderUnitDepartmentsAction,
} from "./actions";

type DepartmentOption = { id: string; key: string; name: string };

type ActionableProps = {
  mode: "unit" | "space";
  locationId: string;
  locationName: string;
  /** Current assigned department IDs from the canonical responsibility rows. */
  selectedDepartmentIds: string[];
  departments: DepartmentOption[];
  /** When mode=unit and this unit has descendants, show Apply. */
  unitForDescendants?: UnitHierarchyNode | null;
  level2Singular?: string;
  level2Plural?: string;
  level3Singular?: string;
  level3Plural?: string;
};

/**
 * Compact department responsibility for actionable locations (neighborhoods / rooms).
 * Floors use FloorBulkDepartmentApply instead — they are structural organizers.
 */
export function DepartmentResponsibilityCheckboxes({
  mode,
  locationId,
  locationName,
  selectedDepartmentIds,
  departments,
  unitForDescendants = null,
  level2Singular = "Neighborhood",
  level2Plural = "Neighborhoods",
  level3Singular = "Room",
  level3Plural = "Rooms",
}: ActionableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const selected = new Set(selectedDepartmentIds);

  const descendantTargets = unitForDescendants
    ? collectDescendantResponsibilityTargets(unitForDescendants)
    : null;
  const hasDescendants =
    descendantTargets != null &&
    (descendantTargets.neighborhoodUnitIds.length > 0 ||
      descendantTargets.spaceIds.length > 0);

  function toggleDepartment(departmentId: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(departmentId);
    else next.delete(departmentId);
    const departmentIds = [...next];

    startTransition(async () => {
      try {
        if (mode === "unit") {
          await setBuilderUnitDepartmentsAction({ unitId: locationId, departmentIds });
        } else {
          await setBuilderSpaceDepartmentsAction({ spaceId: locationId, departmentIds });
        }
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not update responsibility.");
      }
    });
  }

  function applyToDescendants() {
    if (!unitForDescendants || !descendantTargets) return;
    const scopeSummary = summarizeApplyScope({
      neighborhoodCount: descendantTargets.neighborhoodUnitIds.length,
      roomCount: descendantTargets.spaceIds.length,
      level2Singular,
      level2Plural,
      level3Singular,
      level3Plural,
    });
    const message = formatApplyToDescendantsConfirm({
      locationName,
      scopeSummary,
    });
    if (!confirm(message)) return;

    startTransition(async () => {
      try {
        await applyBuilderUnitResponsibilitiesToDescendantsAction({
          unitId: locationId,
        });
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not apply to locations below.");
      }
    });
  }

  return (
    <div className="space-y-2" data-testid="department-responsibility">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Department responsibility</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          {mode === "space"
            ? "Choose the Departments responsible for this Room. Rooms do not inherit responsibility from their Neighborhood."
            : "Choose the Departments responsible for this Neighborhood. Rooms below keep their own explicit assignments."}
        </p>
      </div>

      {departments.length === 0 ? (
        <p className="text-xs text-zinc-500">No departments are available for this facility.</p>
      ) : (
        <ul className="space-y-1.5" data-testid="department-responsibility-list">
          {departments.map((dept) => {
            const isChecked = selected.has(dept.id);
            return (
              <li key={dept.id}>
                <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm text-zinc-800 hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-300"
                    checked={isChecked}
                    disabled={isPending}
                    data-testid={`department-responsibility-${dept.key}`}
                    onChange={(e) => toggleDepartment(dept.id, e.target.checked)}
                  />
                  <span>{dept.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {mode === "unit" && hasDescendants ? (
        <button
          type="button"
          data-testid="apply-responsibility-to-descendants"
          disabled={isPending}
          onClick={applyToDescendants}
          className="mt-1 inline-flex min-h-9 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          Apply to locations below
        </button>
      ) : null}
    </div>
  );
}

type FloorBulkProps = {
  floor: UnitHierarchyNode;
  departments: DepartmentOption[];
  level2Singular?: string;
  level2Plural?: string;
  level3Singular?: string;
  level3Plural?: string;
};

/**
 * Structural floor bulk assigner — chooses departments and applies them to
 * actionable descendants only. Never writes responsibility onto the floor itself.
 */
export function FloorBulkDepartmentApply({
  floor,
  departments,
  level2Singular = "Neighborhood",
  level2Plural = "Neighborhoods",
  level3Singular = "Room",
  level3Plural = "Rooms",
}: FloorBulkProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draftIds, setDraftIds] = useState<string[]>([]);

  const targets = collectDescendantResponsibilityTargets(floor);
  const hasDescendants =
    targets.neighborhoodUnitIds.length > 0 || targets.spaceIds.length > 0;

  function toggleDraft(departmentId: string, checked: boolean) {
    setDraftIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(departmentId);
      else next.delete(departmentId);
      return [...next];
    });
  }

  function apply() {
    if (!hasDescendants) return;
    const scopeSummary = summarizeApplyScope({
      neighborhoodCount: targets.neighborhoodUnitIds.length,
      roomCount: targets.spaceIds.length,
      level2Singular,
      level2Plural,
      level3Singular,
      level3Plural,
    });
    const message = formatStructuralBulkApplyConfirm({
      locationName: floor.name,
      scopeSummary,
    });
    if (!confirm(message)) return;

    startTransition(async () => {
      try {
        await applyDepartmentsToActionableDescendantsAction({
          scopeUnitId: floor.id,
          departmentIds: draftIds,
        });
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not apply departments below.");
      }
    });
  }

  if (!hasDescendants) {
    return (
      <div className="space-y-1" data-testid="floor-bulk-department-apply">
        <h3 className="text-sm font-semibold text-zinc-900">
          Apply Departments to locations on this Floor
        </h3>
        <p className="text-xs text-zinc-500">
          Add neighborhoods or rooms under this floor before applying department assignments. The
          Floor itself does not own Department responsibility.
        </p>
      </div>
    );
  }

  const childSummary = summarizeApplyScope({
    neighborhoodCount: targets.neighborhoodUnitIds.length,
    roomCount: targets.spaceIds.length,
    level2Singular,
    level2Plural,
    level3Singular,
    level3Plural,
  });

  return (
    <div className="space-y-2" data-testid="floor-bulk-department-apply">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">
          Apply Departments to locations on this Floor
        </h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          Bulk edit for {childSummary}. Does not assign responsibility to the Floor itself.
        </p>
      </div>

      {departments.length === 0 ? (
        <p className="text-xs text-zinc-500">No departments are available for this facility.</p>
      ) : (
        <ul className="space-y-1.5" data-testid="floor-bulk-department-list">
          {departments.map((dept) => {
            const isChecked = draftIds.includes(dept.id);
            return (
              <li key={dept.id}>
                <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm text-zinc-800 hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-300"
                    checked={isChecked}
                    disabled={isPending}
                    data-testid={`floor-bulk-department-${dept.key}`}
                    onChange={(e) => toggleDraft(dept.id, e.target.checked)}
                  />
                  <span>{dept.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        data-testid="apply-departments-to-locations-below"
        disabled={isPending || departments.length === 0}
        onClick={apply}
        className="mt-1 inline-flex min-h-9 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
      >
        Apply
      </button>
    </div>
  );
}

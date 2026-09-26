"use client";

import { useState } from "react";

import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import { CycleEditorFields } from "@/app/(protected)/admin/departments/[departmentId]/cycles-builder-controls";
import { updateCycleDraftAction } from "@/app/(protected)/admin/departments/[departmentId]/cycle-actions";
import {
  createTeamCycleAction,
  linkTeamCycleAction,
  unlinkTeamCycleAction,
  updateTeamCycleNeedAction,
} from "@/app/(protected)/admin/departments/[departmentId]/team-cycle-actions";
import { Button } from "@/components/design-system/Button";
import { formatCycleWindow, formatDaysSummary } from "@/lib/operational-cycles/cycle-display";
import type {
  DepartmentCycleOption,
  DepartmentTeamView,
  TeamCatalog,
  TeamCycleView,
} from "@/lib/department-teams";

type Props = {
  departmentId: string;
  team: DepartmentTeamView;
  catalog: TeamCatalog;
  cycleOptions: DepartmentCycleOption[];
  canManage: boolean;
  showMeal: boolean;
  nextDayKey: string;
};

export function TeamCyclesPanel({
  departmentId,
  team,
  catalog,
  cycleOptions,
  canManage,
  showMeal,
  nextDayKey,
}: Props) {
  const [mode, setMode] = useState<"none" | "create" | "link" | "phase" | "keytime">("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const linkedKeys = new Set(team.cycles.map((row) => row.cycleStableKey));
  const linkable = cycleOptions.filter((option) => !linkedKeys.has(option.stableKey));
  const editorCatalog = {
    locations: catalog.locations,
    roomTypes: catalog.roomTypes,
    operationalTypes: catalog.operationalTypes,
  };

  return (
    <section className="space-y-3 border-t border-zinc-100 pt-4" data-testid="team-cycles">
      <div>
        <h3 className="text-xs font-medium text-zinc-500">Cycles this team runs</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Cycles belong to the department. Link Breakfast once; another team can share it. Staffing
          need is this team’s count for that cycle — leave empty when none is required.
        </p>
      </div>

      {team.cycles.length === 0 ? (
        <p className="text-sm text-zinc-500" data-testid="team-cycles-empty">
          No cycles yet. Create one or link an existing department cycle.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="team-cycle-list">
          {team.cycles.map((row) => (
            <li
              key={row.id}
              className="rounded-md border border-zinc-200 px-3 py-2.5"
              data-testid="team-cycle-row"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900">{row.label}</p>
                  <p className="text-xs text-zinc-500">
                    {formatCycleWindow(row.startLocal, row.endLocal)}
                    {" · "}
                    {formatDaysSummary(row.applicableDaysOfWeek)}
                    {row.status === "DRAFT" ? " · Draft" : null}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    {row.cycleId && row.status === "DRAFT" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="compact"
                        onClick={() =>
                          setEditingId((current) => (current === row.cycleId ? null : row.cycleId))
                        }
                      >
                        {editingId === row.cycleId ? "Close editor" : "Edit timeline"}
                      </Button>
                    ) : null}
                    <DepartmentAdminActionForm action={unlinkTeamCycleAction}>
                      <input type="hidden" name="departmentId" value={departmentId} />
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="linkId" value={row.id} />
                      <Button type="submit" variant="secondary" size="compact">
                        Unlink
                      </Button>
                    </DepartmentAdminActionForm>
                  </div>
                ) : null}
              </div>

              {canManage ? (
                <DepartmentAdminActionForm
                  action={updateTeamCycleNeedAction}
                  className="mt-3 grid gap-2 sm:grid-cols-[6rem_1fr_auto] sm:items-end"
                >
                  <input type="hidden" name="departmentId" value={departmentId} />
                  <input type="hidden" name="teamId" value={team.id} />
                  <input type="hidden" name="linkId" value={row.id} />
                  <label className="block text-xs font-medium text-zinc-700">
                    Need
                    <input
                      name="requiredCount"
                      type="number"
                      min={1}
                      defaultValue={row.requiredCount ?? ""}
                      placeholder="None"
                      className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      data-testid="team-cycle-need-count"
                    />
                  </label>
                  <label className="block text-xs font-medium text-zinc-700">
                    Grain
                    <select
                      name="grain"
                      defaultValue={row.grain}
                      className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      data-testid="team-cycle-need-grain"
                    >
                      <option value="TOTAL">total</option>
                      <option value="PER_ROOM">per room</option>
                    </select>
                  </label>
                  <Button type="submit" size="compact">
                    Save need
                  </Button>
                </DepartmentAdminActionForm>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">{needSummary(row)}</p>
              )}

              {row.children.length > 0 ? (
                <ul className="mt-2 space-y-0.5 border-t border-zinc-100 pt-2">
                  {row.children.map((child) => (
                    <li key={child.id} className="text-xs text-zinc-600">
                      {child.nodeKind === "KEY_TIME" ? "Key time" : "Phase"} · {child.label}
                      {child.startLocal && child.endLocal
                        ? ` · ${formatCycleWindow(child.startLocal, child.endLocal)}`
                        : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {editingId === row.cycleId && row.cycleId ? (
                <DepartmentAdminActionForm
                  action={updateCycleDraftAction}
                  className="mt-3 space-y-3 border-t border-zinc-100 pt-3"
                  onSuccess={() => setEditingId(null)}
                >
                  <input type="hidden" name="departmentId" value={departmentId} />
                  <input type="hidden" name="cycleId" value={row.cycleId} />
                  <CycleEditorFields
                    idPrefix={`team-edit-${row.cycleStableKey}`}
                    showMeal={showMeal}
                    compactCreate
                    catalog={editorCatalog}
                    defaults={{
                      label: row.label,
                      startLocal: row.startLocal,
                      endLocal: row.endLocal,
                      applicableDaysOfWeek: row.applicableDaysOfWeek,
                      effectiveFrom: nextDayKey,
                      cycleType: "CUSTOM",
                      locationMode: "EXPLICIT_UNITS",
                      spaceIds: team.rooms.map((room) => room.spaceId),
                      parentStableKey: null,
                    }}
                  />
                  <Button type="submit" size="compact">
                    Save cycle
                  </Button>
                </DepartmentAdminActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="compact"
            onClick={() => setMode((current) => (current === "create" ? "none" : "create"))}
            data-testid="team-cycle-create"
          >
            + Create cycle
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() => setMode((current) => (current === "link" ? "none" : "link"))}
            data-testid="team-cycle-link"
          >
            Link existing
          </Button>
          {team.cycles.length > 0 ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="compact"
                onClick={() => setMode((current) => (current === "phase" ? "none" : "phase"))}
                data-testid="team-cycle-add-phase"
              >
                + Add phase
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="compact"
                onClick={() => setMode((current) => (current === "keytime" ? "none" : "keytime"))}
                data-testid="team-cycle-add-key-time"
              >
                + Add key time
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {canManage && mode === "create" ? (
        <DepartmentAdminActionForm
          action={createTeamCycleAction}
          className="space-y-3 rounded-md border border-zinc-200 p-3"
          onSuccess={() => setMode("none")}
        >
          <input type="hidden" name="departmentId" value={departmentId} />
          <input type="hidden" name="teamId" value={team.id} />
          <CycleEditorFields
            idPrefix={`team-create-${team.id}`}
            showMeal={showMeal}
            compactCreate
            catalog={editorCatalog}
            defaults={{
              effectiveFrom: nextDayKey,
              cycleType: "CUSTOM",
              locationMode: "EXPLICIT_UNITS",
              spaceIds: team.rooms.map((room) => room.spaceId),
              applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
              parentStableKey: null,
              mealType: showMeal ? "BREAKFAST" : null,
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Create and link</Button>
            <Button type="button" variant="secondary" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </div>
        </DepartmentAdminActionForm>
      ) : null}

      {canManage && mode === "link" ? (
        <DepartmentAdminActionForm
          action={linkTeamCycleAction}
          className="space-y-3 rounded-md border border-zinc-200 p-3"
          onSuccess={() => setMode("none")}
        >
          <input type="hidden" name="departmentId" value={departmentId} />
          <input type="hidden" name="teamId" value={team.id} />
          {linkable.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No other department cycles to link. Create Breakfast once, then other teams can share
              it.
            </p>
          ) : (
            <label className="block text-xs font-medium text-zinc-700">
              Existing cycle
              <select
                name="cycleStableKey"
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                data-testid="team-cycle-link-select"
              >
                <option value="">Select a cycle…</option>
                {linkable.map((option) => (
                  <option key={option.stableKey} value={option.stableKey}>
                    {option.label}
                    {option.startLocal && option.endLocal
                      ? ` · ${formatCycleWindow(option.startLocal, option.endLocal)}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={linkable.length === 0}>
              Link cycle
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </div>
        </DepartmentAdminActionForm>
      ) : null}

      {canManage && (mode === "phase" || mode === "keytime") && team.cycles[0] ? (
        <DepartmentAdminActionForm
          action={createTeamCycleAction}
          className="space-y-3 rounded-md border border-zinc-200 p-3"
          onSuccess={() => setMode("none")}
        >
          <input type="hidden" name="departmentId" value={departmentId} />
          <input type="hidden" name="teamId" value={team.id} />
          <CycleEditorFields
            idPrefix={`team-${mode}-${team.id}`}
            showMeal={showMeal}
            compactCreate
            catalog={editorCatalog}
            parentOptions={team.cycles.map((row) => ({
              stableKey: row.cycleStableKey,
              label: row.label,
              displayPath: row.label,
            }))}
            defaults={{
              effectiveFrom: nextDayKey,
              cycleType: "CUSTOM",
              nodeKind: mode === "keytime" ? "KEY_TIME" : "PERIOD",
              locationInheritFromParent: true,
              parentStableKey: team.cycles[0]!.cycleStableKey,
              applicableDaysOfWeek: team.cycles[0]!.applicableDaysOfWeek,
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit">{mode === "keytime" ? "Add key time" : "Add phase"}</Button>
            <Button type="button" variant="secondary" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </div>
        </DepartmentAdminActionForm>
      ) : null}
    </section>
  );
}

function needSummary(row: TeamCycleView): string {
  if (row.requiredCount == null) return "No staffing need.";
  return row.grain === "PER_ROOM"
    ? `Need ${row.requiredCount} per room`
    : `Need ${row.requiredCount} total`;
}

"use client";

import { useState } from "react";
import { SpaceType, UnitDepartmentKind, type UnitType } from "@prisma/client";

import { Drawer } from "@/components/drawer";
import type {
  FacilityHierarchy,
  UnitHierarchyNode,
  SpaceView,
  DeptResponsibilityView,
  SpaceResponsibilityView,
} from "@/lib/facility-builder/load-facility-hierarchy";
import {
  CAPABILITY_KEYS,
  CAPABILITY_LABELS,
  resolveEffectiveCapabilities,
} from "@/lib/facility-builder/load-facility-hierarchy";
import {
  createBuilderUnitAction,
  updateBuilderUnitAction,
  deleteBuilderUnitAction,
  createBuilderSpaceAction,
  updateBuilderSpaceAction,
  deleteBuilderSpaceAction,
  upsertBuilderUnitResponsibilityAction,
  deleteBuilderUnitResponsibilityAction,
  upsertBuilderSpaceResponsibilityAction,
  deleteBuilderSpaceResponsibilityAction,
} from "./actions";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNIT_TYPE_OPTIONS: UnitType[] = [
  "SERVERY", "KITCHEN", "RETAIL", "OFFICE", "STORAGE",
  "RESIDENT_AREA", "COMMON_AREA", "MECHANICAL", "RESTROOM_CLUSTER",
  "EVS_ZONE", "GROUND", "OTHER",
];

const SPACE_TYPE_OPTIONS = Object.values(SpaceType);

const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  SERVICE_AREA: "Service area",
  PATIENT_ROOM: "Patient room",
  PRODUCTION_AREA: "Production area",
  STORAGE: "Storage",
  UTILITY: "Utility",
  OFFICE: "Office",
  RESTROOM: "Restroom",
  MECHANICAL: "Mechanical",
  PUBLIC_AREA: "Public area",
  OTHER: "Other",
};

const KIND_LABELS: Record<UnitDepartmentKind, string> = {
  PRIMARY: "Primary",
  BACKUP: "Backup",
  SUPPORT: "Support",
};

type Selection =
  | { type: "unit"; unitId: string }
  | { type: "space"; spaceId: string; unitId: string }
  | null;

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function FacilityBuilderClient({ hierarchy }: { hierarchy: FacilityHierarchy }) {
  const [selection, setSelection] = useState<Selection>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const u of hierarchy.units) set.add(u.id);
    return set;
  });
  const [createUnitDrawer, setCreateUnitDrawer] = useState<{ parentId: string | null } | null>(null);
  const [createSpaceDrawer, setCreateSpaceDrawer] = useState<{ unitId: string } | null>(null);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedUnit = selection?.type === "unit"
    ? findUnit(hierarchy.units, selection.unitId)
    : null;
  const selectedSpace = selection?.type === "space"
    ? findSpace(hierarchy.units, selection.spaceId)
    : null;
  const parentUnitOfSpace = selection?.type === "space"
    ? findUnit(hierarchy.units, selection.unitId)
    : null;

  const allFlatUnits = flattenUnits(hierarchy.units);

  return (
    <div className="flex gap-6 items-start">
      {/* Left — Hierarchy tree */}
      <div className="w-80 shrink-0 rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2.5">
          <h2 className="text-sm font-semibold text-zinc-900">{hierarchy.facilityName}</h2>
          <button
            type="button"
            onClick={() => setCreateUnitDrawer({ parentId: null })}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            + Unit
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-1">
          {hierarchy.units.length === 0 ? (
            <p className="px-3 py-4 text-xs text-zinc-500">
              No units yet. Add your first unit to start building the facility hierarchy.
            </p>
          ) : (
            <ul>
              {hierarchy.units.map((unit) => (
                <TreeUnitNode
                  key={unit.id}
                  unit={unit}
                  depth={0}
                  expanded={expanded}
                  selection={selection}
                  onToggle={toggleExpand}
                  onSelect={setSelection}
                  onCreateUnit={(parentId) => setCreateUnitDrawer({ parentId })}
                  onCreateSpace={(unitId) => setCreateSpaceDrawer({ unitId })}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Right — Editor panel */}
      <div className="min-w-0 flex-1">
        {!selection && (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center">
            <p className="text-sm text-zinc-500">
              Select a unit or space from the tree to view and edit its configuration.
            </p>
          </div>
        )}

        {selectedUnit && (
          <UnitEditor
            unit={selectedUnit}
            allUnits={allFlatUnits}
            departments={hierarchy.departments}
            onCreateSpace={(unitId) => setCreateSpaceDrawer({ unitId })}
          />
        )}

        {selectedSpace && parentUnitOfSpace && (
          <SpaceEditor
            space={selectedSpace}
            parentUnit={parentUnitOfSpace}
            departments={hierarchy.departments}
          />
        )}
      </div>

      {/* Create unit drawer */}
      {createUnitDrawer && (
        <Drawer
          open
          onClose={() => setCreateUnitDrawer(null)}
          title="Add unit"
        >
          <CreateUnitForm
            parentId={createUnitDrawer.parentId}
            allUnits={allFlatUnits}
            onDone={() => setCreateUnitDrawer(null)}
          />
        </Drawer>
      )}

      {/* Create space drawer */}
      {createSpaceDrawer && (
        <Drawer
          open
          onClose={() => setCreateSpaceDrawer(null)}
          title="Add space"
        >
          <CreateSpaceForm
            unitId={createSpaceDrawer.unitId}
            onDone={() => setCreateSpaceDrawer(null)}
          />
        </Drawer>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree node
// ---------------------------------------------------------------------------

function TreeUnitNode({
  unit,
  depth,
  expanded,
  selection,
  onToggle,
  onSelect,
  onCreateUnit,
  onCreateSpace,
}: {
  unit: UnitHierarchyNode;
  depth: number;
  expanded: Set<string>;
  selection: Selection;
  onToggle: (id: string) => void;
  onSelect: (s: Selection) => void;
  onCreateUnit: (parentId: string) => void;
  onCreateSpace: (unitId: string) => void;
}) {
  const isExpanded = expanded.has(unit.id);
  const hasChildren = unit.childUnits.length > 0 || unit.childSpaces.length > 0;
  const isSelected = selection?.type === "unit" && selection.unitId === unit.id;

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer ${
          isSelected
            ? "bg-zinc-900 text-white"
            : "text-zinc-800 hover:bg-zinc-100"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <button
          type="button"
          onClick={() => onToggle(unit.id)}
          className={`shrink-0 w-4 text-center text-xs ${
            isSelected ? "text-zinc-300" : "text-zinc-400"
          } ${hasChildren ? "" : "invisible"}`}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? "▾" : "▸"}
        </button>
        <button
          type="button"
          onClick={() => onSelect({ type: "unit", unitId: unit.id })}
          className="min-w-0 flex-1 truncate text-left"
        >
          <span className={`font-medium ${!unit.isActive ? "opacity-50" : ""}`}>
            {unit.name}
          </span>
        </button>
        <span
          className={`shrink-0 text-[10px] ${
            isSelected
              ? "text-zinc-400"
              : "text-zinc-400 opacity-0 group-hover:opacity-100"
          }`}
        >
          {unit.childSpaces.length > 0 && `${unit.childSpaces.length}s`}
          {unit.childUnits.length > 0 && ` ${unit.childUnits.length}u`}
        </span>
        <div className={`shrink-0 flex gap-0.5 ${isSelected ? "" : "opacity-0 group-hover:opacity-100"}`}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCreateUnit(unit.id); }}
            className={`rounded px-1 text-[10px] ${
              isSelected ? "text-zinc-300 hover:text-white" : "text-zinc-400 hover:text-zinc-700"
            }`}
            title="Add child unit"
          >
            +U
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCreateSpace(unit.id); }}
            className={`rounded px-1 text-[10px] ${
              isSelected ? "text-zinc-300 hover:text-white" : "text-zinc-400 hover:text-zinc-700"
            }`}
            title="Add space"
          >
            +S
          </button>
        </div>
      </div>

      {isExpanded && hasChildren && (
        <ul>
          {unit.childUnits.map((child) => (
            <TreeUnitNode
              key={child.id}
              unit={child}
              depth={depth + 1}
              expanded={expanded}
              selection={selection}
              onToggle={onToggle}
              onSelect={onSelect}
              onCreateUnit={onCreateUnit}
              onCreateSpace={onCreateSpace}
            />
          ))}
          {unit.childSpaces.map((space) => (
            <TreeSpaceNode
              key={space.id}
              space={space}
              unitId={unit.id}
              depth={depth + 1}
              selection={selection}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function TreeSpaceNode({
  space,
  unitId,
  depth,
  selection,
  onSelect,
}: {
  space: SpaceView;
  unitId: string;
  depth: number;
  selection: Selection;
  onSelect: (s: Selection) => void;
}) {
  const isSelected =
    selection?.type === "space" && selection.spaceId === space.id;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect({ type: "space", spaceId: space.id, unitId })}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm cursor-pointer ${
          isSelected
            ? "bg-zinc-900 text-white"
            : "text-zinc-600 hover:bg-zinc-100"
        }`}
        style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
      >
        <span className={`text-[10px] ${isSelected ? "text-zinc-400" : "text-zinc-400"}`}>◻</span>
        <span className={`min-w-0 truncate ${!space.isActive ? "opacity-50" : ""}`}>
          {space.name}
        </span>
        <span className={`ml-auto shrink-0 text-[10px] ${isSelected ? "text-zinc-400" : "text-zinc-400"}`}>
          {SPACE_TYPE_LABELS[space.spaceType]}
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Unit editor
// ---------------------------------------------------------------------------

function UnitEditor({
  unit,
  allUnits,
  departments,
  onCreateSpace,
}: {
  unit: UnitHierarchyNode;
  allUnits: { id: string; name: string; parentUnitId: string | null }[];
  departments: { id: string; key: string; name: string }[];
  onCreateSpace: (unitId: string) => void;
}) {
  const parentOptions = allUnits.filter((u) => u.id !== unit.id);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{unit.name}</h2>
            <p className="text-xs text-zinc-500">
              {unit.unitType} · Order {unit.displayOrder} · {unit.isActive ? "Active" : "Inactive"}
              {unit.childUnits.length > 0 && ` · ${unit.childUnits.length} child unit(s)`}
              {unit.childSpaces.length > 0 && ` · ${unit.childSpaces.length} space(s)`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onCreateSpace(unit.id)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Add space
            </button>
          </div>
        </div>

        <form action={updateBuilderUnitAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="unitId" value={unit.id} />
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Name
            <input
              name="name"
              defaultValue={unit.name}
              required
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Type
            <select
              name="unitType"
              defaultValue={unit.unitType}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              {UNIT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Parent unit
            <select
              name="parentUnitId"
              defaultValue={unit.parentUnitId ?? ""}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">No parent (top-level)</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Display order
            <input
              type="number"
              name="displayOrder"
              defaultValue={unit.displayOrder}
              min={1}
              max={9999}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="sm:col-span-2 flex flex-col gap-1 text-xs text-zinc-600">
            Description
            <input
              name="description"
              defaultValue={unit.description ?? ""}
              placeholder="Optional notes"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked={unit.isActive} />
            Active
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Save changes
            </button>
            <form action={deleteBuilderUnitAction}>
              <input type="hidden" name="unitId" value={unit.id} />
              <button
                type="submit"
                className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                onClick={(e) => {
                  if (!confirm(`Delete "${unit.name}"? This cannot be undone.`)) {
                    e.preventDefault();
                  }
                }}
              >
                Delete
              </button>
            </form>
          </div>
        </form>
      </div>

      {/* Department responsibilities */}
      <UnitResponsibilityEditor
        unitId={unit.id}
        responsibilities={unit.departmentResponsibilities}
        departments={departments}
      />

      {/* Spaces summary */}
      {unit.childSpaces.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-900">
            Spaces ({unit.childSpaces.length})
          </h3>
          <ul className="mt-2 divide-y divide-zinc-100">
            {unit.childSpaces.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span className={`text-zinc-800 ${!s.isActive ? "opacity-50" : ""}`}>
                  {s.name}
                  <span className="ml-2 text-xs text-zinc-400">{SPACE_TYPE_LABELS[s.spaceType]}</span>
                </span>
                <span className="text-xs text-zinc-500">
                  {s.responsibilities.length > 0
                    ? `${s.responsibilities.length} override(s)`
                    : "Inherits"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Space editor
// ---------------------------------------------------------------------------

function SpaceEditor({
  space,
  parentUnit,
  departments,
}: {
  space: SpaceView;
  parentUnit: UnitHierarchyNode;
  departments: { id: string; key: string; name: string }[];
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{space.name}</h2>
            <p className="text-xs text-zinc-500">
              {SPACE_TYPE_LABELS[space.spaceType]} in {parentUnit.name} ·
              Order {space.sortOrder} · {space.isActive ? "Active" : "Inactive"}
            </p>
          </div>
        </div>

        <form action={updateBuilderSpaceAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="spaceId" value={space.id} />
          <input type="hidden" name="unitId" value={parentUnit.id} />
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Name
            <input
              name="name"
              defaultValue={space.name}
              required
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Type
            <select
              name="spaceType"
              defaultValue={space.spaceType}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              {SPACE_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{SPACE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Code
            <input
              name="code"
              defaultValue={space.code ?? ""}
              placeholder="Optional short code"
              maxLength={20}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Sort order
            <input
              type="number"
              name="sortOrder"
              defaultValue={space.sortOrder}
              min={1}
              max={9999}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="sm:col-span-2 flex flex-col gap-1 text-xs text-zinc-600">
            Description
            <input
              name="description"
              defaultValue={space.description ?? ""}
              placeholder="Optional notes"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked={space.isActive} />
            Active
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Save changes
            </button>
            <form action={deleteBuilderSpaceAction}>
              <input type="hidden" name="spaceId" value={space.id} />
              <button
                type="submit"
                className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                onClick={(e) => {
                  if (!confirm(`Delete "${space.name}"? This cannot be undone.`)) {
                    e.preventDefault();
                  }
                }}
              >
                Delete
              </button>
            </form>
          </div>
        </form>
      </div>

      {/* Responsibility inheritance visualization + overrides */}
      <SpaceResponsibilityEditor
        space={space}
        parentUnit={parentUnit}
        departments={departments}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unit responsibility editor
// ---------------------------------------------------------------------------

function UnitResponsibilityEditor({
  unitId,
  responsibilities,
  departments,
}: {
  unitId: string;
  responsibilities: DeptResponsibilityView[];
  departments: { id: string; key: string; name: string }[];
}) {
  const assignedDeptIds = new Set(responsibilities.map((r) => r.department.id));
  const available = departments.filter((d) => !assignedDeptIds.has(d.id));

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">Department responsibilities</h3>
      <p className="mt-0.5 text-xs text-zinc-500">
        Which departments operate at this location, and what capabilities they have.
        Empty capabilities = full legacy access.
      </p>

      <ul className="mt-3 space-y-2">
        {responsibilities.map((r) => (
          <li
            key={r.id}
            className="rounded-md border border-zinc-200 bg-zinc-50/80 px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm font-medium text-zinc-800">{r.department.name}</span>
                <span className="ml-1.5 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                  {KIND_LABELS[r.kind]}
                </span>
                <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                  Direct
                </span>
                {r.riskLevel && (
                  <span className="ml-1.5 text-xs text-zinc-500">Risk: {r.riskLevel}</span>
                )}
              </div>
              <form action={deleteBuilderUnitResponsibilityAction}>
                <input type="hidden" name="responsibilityId" value={r.id} />
                <button type="submit" className="text-xs text-red-700 hover:underline">
                  Remove
                </button>
              </form>
            </div>
            {r.capabilities.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {r.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700"
                  >
                    {CAPABILITY_LABELS[cap as keyof typeof CAPABILITY_LABELS] ?? cap}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[10px] text-zinc-400">
                No capabilities assigned — legacy full access
              </p>
            )}
          </li>
        ))}
        {responsibilities.length === 0 && (
          <li className="text-xs text-zinc-500">No departments linked yet.</li>
        )}
      </ul>

      {available.length > 0 && (
        <AddUnitResponsibilityForm unitId={unitId} available={available} />
      )}
    </div>
  );
}

function AddUnitResponsibilityForm({
  unitId,
  available,
}: {
  unitId: string;
  available: { id: string; key: string; name: string }[];
}) {
  const [showCaps, setShowCaps] = useState(false);

  return (
    <form
      action={upsertBuilderUnitResponsibilityAction}
      className="mt-4 space-y-3 rounded-md border border-dashed border-zinc-300 p-3"
    >
      <input type="hidden" name="unitId" value={unitId} />
      <div className="grid gap-2 sm:grid-cols-3">
        <select name="departmentId" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs">
          {available.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select name="kind" defaultValue="PRIMARY" className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs">
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input
          name="riskLevel"
          placeholder="Risk level (optional)"
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
        />
      </div>
      <div>
        <button
          type="button"
          onClick={() => setShowCaps((v) => !v)}
          className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
        >
          {showCaps ? "Hide capabilities" : "Add capabilities (optional)"}
        </button>
        {showCaps && (
          <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
            {CAPABILITY_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-1.5 text-xs text-zinc-700">
                <input type="checkbox" name="capabilities" value={key} />
                {CAPABILITY_LABELS[key]}
              </label>
            ))}
          </div>
        )}
      </div>
      <button
        type="submit"
        className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
      >
        Add department
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Space responsibility editor with inheritance visualization
// ---------------------------------------------------------------------------

function SpaceResponsibilityEditor({
  space,
  parentUnit,
  departments,
}: {
  space: SpaceView;
  parentUnit: UnitHierarchyNode;
  departments: { id: string; key: string; name: string }[];
}) {
  const allDeptIds = new Set<string>();
  for (const r of parentUnit.departmentResponsibilities) allDeptIds.add(r.department.id);
  for (const r of space.responsibilities) allDeptIds.add(r.department.id);

  const deptMap = new Map(departments.map((d) => [d.id, d]));
  const spaceRespByDept = new Map(space.responsibilities.map((r) => [r.department.id, r]));

  const effectiveRows: {
    departmentId: string;
    departmentName: string;
    source: "direct" | "inherited" | "override";
    capabilities: string[];
    responsibilityId?: string;
    unitKind?: UnitDepartmentKind;
  }[] = [];

  for (const deptId of allDeptIds) {
    const dept = deptMap.get(deptId);
    if (!dept) continue;

    const spaceResp = spaceRespByDept.get(deptId);
    const unitResp = parentUnit.departmentResponsibilities.find(
      (r) => r.department.id === deptId,
    );

    if (spaceResp) {
      effectiveRows.push({
        departmentId: deptId,
        departmentName: dept.name,
        source: unitResp ? "override" : "direct",
        capabilities: spaceResp.capabilities,
        responsibilityId: spaceResp.id,
        unitKind: unitResp?.kind,
      });
    } else if (unitResp) {
      effectiveRows.push({
        departmentId: deptId,
        departmentName: dept.name,
        source: "inherited",
        capabilities: unitResp.capabilities,
        unitKind: unitResp.kind,
      });
    }
  }

  const overridableDepts = departments.filter((d) => !spaceRespByDept.has(d.id));

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">Department responsibilities</h3>
      <p className="mt-0.5 text-xs text-zinc-500">
        Spaces inherit parent unit responsibilities by default. Add an override to change
        capabilities for a specific department at this space.
      </p>

      <ul className="mt-3 space-y-2">
        {effectiveRows.map((row) => (
          <li
            key={row.departmentId}
            className="rounded-md border border-zinc-200 bg-zinc-50/80 px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm font-medium text-zinc-800">{row.departmentName}</span>
                {row.unitKind && (
                  <span className="ml-1.5 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                    {KIND_LABELS[row.unitKind]}
                  </span>
                )}
                <span
                  className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    row.source === "inherited"
                      ? "bg-emerald-50 text-emerald-700"
                      : row.source === "override"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-blue-50 text-blue-700"
                  }`}
                >
                  {row.source === "inherited"
                    ? "Inherited"
                    : row.source === "override"
                      ? "Override"
                      : "Direct"}
                </span>
              </div>
              {row.responsibilityId && (
                <form action={deleteBuilderSpaceResponsibilityAction}>
                  <input type="hidden" name="responsibilityId" value={row.responsibilityId} />
                  <button type="submit" className="text-xs text-red-700 hover:underline">
                    Remove override
                  </button>
                </form>
              )}
            </div>
            {row.capabilities.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {row.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700"
                  >
                    {CAPABILITY_LABELS[cap as keyof typeof CAPABILITY_LABELS] ?? cap}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[10px] text-zinc-400">
                {row.source === "inherited"
                  ? "No capabilities on parent — legacy full access"
                  : "Empty override — no operational access at this space"}
              </p>
            )}
          </li>
        ))}
        {effectiveRows.length === 0 && (
          <li className="text-xs text-zinc-500">
            No department responsibilities. Assign departments to the parent unit first.
          </li>
        )}
      </ul>

      {overridableDepts.length > 0 && parentUnit.departmentResponsibilities.length > 0 && (
        <AddSpaceResponsibilityForm spaceId={space.id} available={overridableDepts} />
      )}
    </div>
  );
}

function AddSpaceResponsibilityForm({
  spaceId,
  available,
}: {
  spaceId: string;
  available: { id: string; key: string; name: string }[];
}) {
  return (
    <form
      action={upsertBuilderSpaceResponsibilityAction}
      className="mt-4 space-y-3 rounded-md border border-dashed border-zinc-300 p-3"
    >
      <input type="hidden" name="spaceId" value={spaceId} />
      <p className="text-xs font-medium text-zinc-600">Add capability override</p>
      <select name="departmentId" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs">
        {available.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {CAPABILITY_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-1.5 text-xs text-zinc-700">
            <input type="checkbox" name="capabilities" value={key} />
            {CAPABILITY_LABELS[key]}
          </label>
        ))}
      </div>
      <p className="text-[10px] text-zinc-400">
        Leave all unchecked to explicitly remove access at this space.
      </p>
      <button
        type="submit"
        className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
      >
        Add override
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Create forms
// ---------------------------------------------------------------------------

function CreateUnitForm({
  parentId,
  allUnits,
  onDone,
}: {
  parentId: string | null;
  allUnits: { id: string; name: string }[];
  onDone: () => void;
}) {
  return (
    <form
      action={async (formData) => {
        await createBuilderUnitAction(formData);
        onDone();
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <label className="sm:col-span-2 flex flex-col gap-1 text-xs text-zinc-600">
        Unit name
        <input
          name="name"
          required
          placeholder="e.g. First Floor, 1A Naval Park"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Type
        <select
          name="unitType"
          defaultValue="OTHER"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          {UNIT_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Parent unit
        <select
          name="parentUnitId"
          defaultValue={parentId ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">No parent (top-level)</option>
          {allUnits.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Display order
        <input
          type="number"
          name="displayOrder"
          defaultValue={100}
          min={1}
          max={9999}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Description
        <input
          name="description"
          placeholder="Optional"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
        <input type="checkbox" name="isActive" defaultChecked />
        Active
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Create unit
        </button>
      </div>
    </form>
  );
}

function CreateSpaceForm({
  unitId,
  onDone,
}: {
  unitId: string;
  onDone: () => void;
}) {
  return (
    <form
      action={async (formData) => {
        await createBuilderSpaceAction(formData);
        onDone();
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <input type="hidden" name="unitId" value={unitId} />
      <label className="sm:col-span-2 flex flex-col gap-1 text-xs text-zinc-600">
        Space name
        <input
          name="name"
          required
          placeholder="e.g. Room 32A, Servery, Soil Hold"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Type
        <select
          name="spaceType"
          defaultValue="OTHER"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          {SPACE_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{SPACE_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Code
        <input
          name="code"
          placeholder="Optional short code"
          maxLength={20}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Sort order
        <input
          type="number"
          name="sortOrder"
          defaultValue={100}
          min={1}
          max={9999}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Description
        <input
          name="description"
          placeholder="Optional"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
        <input type="checkbox" name="isActive" defaultChecked />
        Active
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Create space
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findUnit(
  units: UnitHierarchyNode[],
  id: string,
): UnitHierarchyNode | null {
  for (const u of units) {
    if (u.id === id) return u;
    const found = findUnit(u.childUnits, id);
    if (found) return found;
  }
  return null;
}

function findSpace(
  units: UnitHierarchyNode[],
  spaceId: string,
): SpaceView | null {
  for (const u of units) {
    const s = u.childSpaces.find((s) => s.id === spaceId);
    if (s) return s;
    const found = findSpace(u.childUnits, spaceId);
    if (found) return found;
  }
  return null;
}

function flattenUnits(
  units: UnitHierarchyNode[],
): { id: string; name: string; parentUnitId: string | null }[] {
  const result: { id: string; name: string; parentUnitId: string | null }[] = [];
  function walk(nodes: UnitHierarchyNode[]) {
    for (const u of nodes) {
      result.push({ id: u.id, name: u.name, parentUnitId: u.parentUnitId });
      walk(u.childUnits);
    }
  }
  walk(units);
  return result;
}

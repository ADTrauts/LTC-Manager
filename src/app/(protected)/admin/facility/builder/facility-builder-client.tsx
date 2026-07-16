"use client";

import {
  useState,
  useRef,
  useEffect,
  useTransition,
  type ReactNode,
} from "react";
import { SpaceType, UnitDepartmentKind, type UnitType } from "@prisma/client";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight,
  ChevronDown,
  Building2,
  LayoutGrid,
  DoorOpen,
  MapPin,
  MoreVertical,
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  FolderOpen,
  Folder,
} from "lucide-react";

import { Drawer } from "@/components/drawer";
import type {
  FacilityHierarchy,
  UnitHierarchyNode,
  SpaceView,
  DeptResponsibilityView,
} from "@/lib/facility-builder/load-facility-hierarchy";
import {
  CAPABILITY_KEYS,
  CAPABILITY_LABELS,
} from "@/lib/facility-builder/load-facility-hierarchy";
import {
  resolveBuilderNodeDisplayKind,
  displayKindLabel,
  canAddNeighborhood,
  canAddRoom,
  canMoveUnitOnto,
  canMoveRoomOnto,
  nextTopLevelDisplayOrder,
  type BuilderNodeDisplayKind,
} from "@/lib/facility-builder/builder-display";
import {
  createBuilderFloorAction,
  createBuilderNeighborhoodAction,
  updateBuilderUnitAction,
  deleteBuilderUnitAction,
  createBuilderSpaceAction,
  updateBuilderSpaceAction,
  deleteBuilderSpaceAction,
  upsertBuilderUnitResponsibilityAction,
  deleteBuilderUnitResponsibilityAction,
  upsertBuilderSpaceResponsibilityAction,
  deleteBuilderSpaceResponsibilityAction,
  moveBuilderUnitAction,
  moveBuilderSpaceAction,
  renameBuilderUnitAction,
  renameBuilderSpaceAction,
  toggleBuilderUnitActiveAction,
  convertBuilderLegacyToFloorAction,
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
  const [createUnitDrawer, setCreateUnitDrawer] = useState<{ parentId: string | null; depth: number } | null>(null);
  const [createSpaceDrawer, setCreateSpaceDrawer] = useState<{ unitId: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: { type: "unit"; unit: UnitHierarchyNode; depth: number } | { type: "space"; space: SpaceView; unitId: string };
  } | null>(null);
  const [renaming, setRenaming] = useState<{ type: "unit"; id: string } | { type: "space"; id: string } | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandTo(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(id);
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

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeUnit = findUnit(hierarchy.units, activeId);
    const activeSpaceInfo = findSpaceWithParent(hierarchy.units, activeId);
    const overUnit = findUnit(hierarchy.units, overId);
    if (!overUnit) return;

    if (activeUnit) {
      const dragKind = resolveBuilderNodeDisplayKind(activeUnit);
      const dropKind = resolveBuilderNodeDisplayKind(overUnit);
      if (!canMoveUnitOnto(dragKind, dropKind)) return;
      if (overUnit.id === activeUnit.parentUnitId) return;
      startTransition(() => {
        moveBuilderUnitAction({
          unitId: activeUnit.id,
          newParentUnitId: overUnit.id,
          newDisplayOrder: activeUnit.displayOrder,
        });
      });
      expandTo(overUnit.id);
    } else if (activeSpaceInfo) {
      const dropKind = resolveBuilderNodeDisplayKind(overUnit);
      if (!canMoveRoomOnto(dropKind)) return;
      if (overUnit.id === activeSpaceInfo.parentUnitId) return;
      startTransition(() => {
        moveBuilderSpaceAction({
          spaceId: activeSpaceInfo.space.id,
          newUnitId: overUnit.id,
          newSortOrder: activeSpaceInfo.space.sortOrder,
        });
      });
      expandTo(overUnit.id);
    }
  }

  const hasAnyUnits = hierarchy.units.length > 0;
  const hasFloors = hierarchy.units.some((u) => resolveBuilderNodeDisplayKind(u) === "floor");
  const nextFloorOrder = nextTopLevelDisplayOrder(hierarchy.units);

  function openAddFloor() {
    setCreateUnitDrawer({ parentId: null, depth: 0 });
  }

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [contextMenu]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-6 items-start">
        {/* Left — Hierarchy tree */}
        <div className="flex w-80 shrink-0 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-900">{hierarchy.facilityName}</h2>
            </div>
          </div>

          {/* Persistent facility-level Add Floor — outside scroll region */}
          <div className="border-b border-zinc-100 px-2 py-2">
            <button
              type="button"
              data-testid="add-floor-root"
              onClick={openAddFloor}
              className="flex w-full items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Floor
            </button>
          </div>

          <div className="max-h-[calc(70vh-4rem)] overflow-y-auto px-1 py-1.5">
            {!hasAnyUnits ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-medium text-zinc-700">No floors have been added yet.</p>
                <p className="mt-2 text-xs text-zinc-500">
                  Floors organize neighborhoods and rooms. Existing top-level locations can be moved into a floor later.
                </p>
                <button
                  type="button"
                  data-testid="add-floor-empty"
                  onClick={openAddFloor}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  <Plus className="h-4 w-4" />
                  Add Floor
                </button>
              </div>
            ) : (
              <>
                {!hasFloors && (
                  <p className="mx-2 mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Top-level locations below are not assigned to a floor. Add a Floor, then drag them into it.
                  </p>
                )}
                <ul className="space-y-0.5">
                  {hierarchy.units.map((unit) => (
                    <TreeUnitNode
                      key={unit.id}
                      unit={unit}
                      depth={0}
                      expanded={expanded}
                      selection={selection}
                      renaming={renaming}
                      onToggle={toggleExpand}
                      onSelect={setSelection}
                      onContextMenu={(e, target) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY, target });
                      }}
                      onCreateUnit={(parentId, depth) => setCreateUnitDrawer({ parentId, depth })}
                      onCreateSpace={(unitId) => setCreateSpaceDrawer({ unitId })}
                      onRename={setRenaming}
                      onRenameComplete={() => setRenaming(null)}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Right — Editor panel */}
        <div className="min-w-0 flex-1">
          {!selection && (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-16 text-center">
              <Building2 className="mx-auto h-8 w-8 text-zinc-300" />
              <p className="mt-3 text-sm text-zinc-500">
                Select a floor, neighborhood, or room from the tree to view and edit its details.
              </p>
              <button
                type="button"
                data-testid="add-floor-editor-empty"
                onClick={openAddFloor}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                <Plus className="h-4 w-4" />
                Add Floor
              </button>
            </div>
          )}

          {selectedUnit && (
            <UnitEditor
              unit={selectedUnit}
              displayKind={resolveBuilderNodeDisplayKind(selectedUnit)}
              allUnits={allFlatUnits}
              departments={hierarchy.departments}
              onCreateSpace={(unitId) => setCreateSpaceDrawer({ unitId })}
              onCreateNeighborhood={(unitId) => setCreateUnitDrawer({ parentId: unitId, depth: 1 })}
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

        {/* Context menu */}
        {contextMenu && (
          <ContextMenuOverlay
            x={contextMenu.x}
            y={contextMenu.y}
            target={contextMenu.target}
            onClose={() => setContextMenu(null)}
            onRename={(target) => {
              if (target.type === "unit") setRenaming({ type: "unit", id: target.unit.id });
              else setRenaming({ type: "space", id: target.space.id });
              setContextMenu(null);
            }}
            onAddChild={(target) => {
              if (target.type === "unit") {
                setCreateUnitDrawer({ parentId: target.unit.id, depth: target.depth + 1 });
              }
              setContextMenu(null);
            }}
            onAddRoom={(target) => {
              if (target.type === "unit") {
                setCreateSpaceDrawer({ unitId: target.unit.id });
              }
              setContextMenu(null);
            }}
            onToggleActive={(target) => {
              if (target.type === "unit") {
                startTransition(() => toggleBuilderUnitActiveAction(target.unit.id));
              }
              setContextMenu(null);
            }}
            onConvertToFloor={(target) => {
              if (target.type === "unit") {
                startTransition(async () => {
                  try {
                    await convertBuilderLegacyToFloorAction(target.unit.id);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Convert failed.");
                  }
                });
              }
              setContextMenu(null);
            }}
            onDelete={(target) => {
              if (target.type === "unit") {
                if (!confirm(
                  `Delete "${target.unit.name}"?\n\n` +
                    "Related schedules, logs, repairs, and assets for this location will also be permanently removed. " +
                    "Nested neighborhoods/rooms must be removed first. This cannot be undone.",
                )) return;
                const fd = new FormData();
                fd.set("unitId", target.unit.id);
                startTransition(async () => {
                  try {
                    await deleteBuilderUnitAction(fd);
                    setSelection(null);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Delete failed.");
                  }
                });
              } else {
                if (!confirm(`Delete "${target.space.name}"? This cannot be undone.`)) return;
                const fd = new FormData();
                fd.set("spaceId", target.space.id);
                startTransition(async () => {
                  try {
                    await deleteBuilderSpaceAction(fd);
                    setSelection(null);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Delete failed.");
                  }
                });
              }
              setContextMenu(null);
            }}
            expanded={expanded}
            onToggleExpand={toggleExpand}
          />
        )}

        {/* Create unit drawer */}
        {createUnitDrawer && (
          <Drawer
            open
            onClose={() => setCreateUnitDrawer(null)}
            title={createUnitDrawer.parentId === null ? "Add Floor" : "Add Neighborhood / Unit"}
          >
            {createUnitDrawer.parentId === null ? (
              <CreateFloorForm
                defaultDisplayOrder={nextFloorOrder}
                onDone={() => setCreateUnitDrawer(null)}
              />
            ) : (
              <CreateNeighborhoodForm
                parentId={createUnitDrawer.parentId}
                onDone={() => setCreateUnitDrawer(null)}
              />
            )}
          </Drawer>
        )}

        {/* Create space drawer */}
        {createSpaceDrawer && (
          <Drawer
            open
            onClose={() => setCreateSpaceDrawer(null)}
            title="Add Room"
          >
            <CreateSpaceForm
              unitId={createSpaceDrawer.unitId}
              onDone={() => setCreateSpaceDrawer(null)}
            />
          </Drawer>
        )}
      </div>

      <DragOverlay>
        {activeDragId && (
          <div className="rounded-md bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-lg border border-zinc-200">
            {findUnit(hierarchy.units, activeDragId)?.name ??
              findSpace(hierarchy.units, activeDragId)?.name ??
              "Moving..."}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Context menu overlay
// ---------------------------------------------------------------------------

type ContextTarget =
  | { type: "unit"; unit: UnitHierarchyNode; depth: number }
  | { type: "space"; space: SpaceView; unitId: string };

function ContextMenuOverlay({
  x,
  y,
  target,
  onClose,
  onRename,
  onAddChild,
  onAddRoom,
  onToggleActive,
  onConvertToFloor,
  onDelete,
  expanded,
  onToggleExpand,
}: {
  x: number;
  y: number;
  target: ContextTarget;
  onClose: () => void;
  onRename: (t: ContextTarget) => void;
  onAddChild: (t: ContextTarget) => void;
  onAddRoom: (t: ContextTarget) => void;
  onToggleActive: (t: ContextTarget) => void;
  onConvertToFloor: (t: ContextTarget) => void;
  onDelete: (t: ContextTarget) => void;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (rect.right > vw) menuRef.current.style.left = `${x - rect.width}px`;
      if (rect.bottom > vh) menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  const isUnit = target.type === "unit";
  const isExpanded = isUnit && expanded.has(target.unit.id);
  const unitActive = isUnit ? target.unit.isActive : true;
  const displayKind = isUnit ? resolveBuilderNodeDisplayKind(target.unit) : null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-lg border border-zinc-200 bg-white py-1 shadow-xl"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <ContextMenuItem icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onRename(target)}>
        Rename
      </ContextMenuItem>

      {isUnit && (
        <>
          <ContextMenuItem
            icon={unitActive ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
            onClick={() => onToggleActive(target)}
          >
            {unitActive ? "Deactivate" : "Activate"}
          </ContextMenuItem>

          {displayKind === "legacy_location" && (
            <>
              <div className="my-1 border-t border-zinc-100" />
              <ContextMenuItem
                icon={<Building2 className="h-3.5 w-3.5" />}
                onClick={() => onConvertToFloor(target)}
              >
                Convert to Floor
              </ContextMenuItem>
              <p className="px-3 py-1.5 text-[11px] text-zinc-400">
                Or drag onto a Floor to assign as Neighborhood
              </p>
            </>
          )}

          {(canAddNeighborhood(displayKind!) || canAddRoom(displayKind!)) && (
            <>
              <div className="my-1 border-t border-zinc-100" />

              {canAddNeighborhood(displayKind!) && (
                <ContextMenuItem icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onAddChild(target)}>
                  Add Neighborhood / Unit
                </ContextMenuItem>
              )}

              {canAddRoom(displayKind!) && (
                <ContextMenuItem icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onAddRoom(target)}>
                  Add Room
                </ContextMenuItem>
              )}
            </>
          )}

          <div className="my-1 border-t border-zinc-100" />

          <ContextMenuItem
            icon={isExpanded ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
            onClick={() => { onToggleExpand(target.unit.id); onClose(); }}
          >
            {isExpanded ? "Collapse" : "Expand"}
          </ContextMenuItem>
        </>
      )}

      <div className="my-1 border-t border-zinc-100" />

      <ContextMenuItem
        icon={<Trash2 className="h-3.5 w-3.5" />}
        onClick={() => onDelete(target)}
        destructive
      >
        Delete
      </ContextMenuItem>
    </div>
  );
}

function ContextMenuItem({
  icon,
  children,
  onClick,
  destructive = false,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors ${
        destructive
          ? "text-red-600 hover:bg-red-50"
          : "text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      <span className={destructive ? "text-red-400" : "text-zinc-400"}>{icon}</span>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tree node — Unit (Floor / Neighborhood)
// ---------------------------------------------------------------------------

function TreeUnitNode({
  unit,
  depth,
  expanded,
  selection,
  renaming,
  onToggle,
  onSelect,
  onContextMenu,
  onCreateUnit,
  onCreateSpace,
  onRename,
  onRenameComplete,
}: {
  unit: UnitHierarchyNode;
  depth: number;
  expanded: Set<string>;
  selection: Selection;
  renaming: { type: "unit" | "space"; id: string } | null;
  onToggle: (id: string) => void;
  onSelect: (s: Selection) => void;
  onContextMenu: (e: React.MouseEvent, target: ContextTarget) => void;
  onCreateUnit: (parentId: string, depth: number) => void;
  onCreateSpace: (unitId: string) => void;
  onRename: (r: { type: "unit" | "space"; id: string }) => void;
  onRenameComplete: () => void;
}) {
  const isExpanded = expanded.has(unit.id);
  const displayKind = resolveBuilderNodeDisplayKind(unit);
  const hasChildren = unit.childUnits.length > 0 || unit.childSpaces.length > 0;
  const canExpand = hasChildren || canAddNeighborhood(displayKind) || canAddRoom(displayKind);
  const isSelected = selection?.type === "unit" && selection.unitId === unit.id;
  const isRenaming = renaming?.type === "unit" && renaming.id === unit.id;
  const [isPending, startTransition] = useTransition();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: unit.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const totalRooms = countSpaces(unit);
  const showAddNeighborhood = canAddNeighborhood(displayKind);
  const showAddRoom = canAddRoom(displayKind);

  const KindIcon =
    displayKind === "floor"
      ? Building2
      : displayKind === "neighborhood"
        ? LayoutGrid
        : MapPin;

  return (
    <li ref={setNodeRef} style={style} data-display-kind={displayKind}>
      <div
        className={`group flex items-center rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? "bg-zinc-900 text-white"
            : displayKind === "floor"
              ? "text-zinc-900 hover:bg-zinc-50 font-medium"
              : "text-zinc-800 hover:bg-zinc-50"
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {/* Drag handle */}
        <button
          type="button"
          className={`shrink-0 p-1 cursor-grab opacity-0 group-hover:opacity-60 transition-opacity ${
            isSelected ? "text-zinc-400" : "text-zinc-300"
          }`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {/* Expand/collapse chevron */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(unit.id); }}
          className={`shrink-0 p-0.5 transition-transform ${
            canExpand ? "" : "invisible"
          } ${isSelected ? "text-zinc-400" : "text-zinc-400"}`}
        >
          {isExpanded
            ? <ChevronDown className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Icon */}
        <span className={`shrink-0 mr-2 ${isSelected ? "text-zinc-400" : "text-zinc-400"}`}>
          <KindIcon className="h-4 w-4" />
        </span>

        {/* Name */}
        <button
          type="button"
          onClick={() => onSelect({ type: "unit", unitId: unit.id })}
          className="min-w-0 flex-1 truncate text-left py-2"
        >
          {isRenaming ? (
            <InlineRenameInput
              defaultValue={unit.name}
              onSubmit={(name) => {
                startTransition(() => renameBuilderUnitAction({ unitId: unit.id, name }));
                onRenameComplete();
              }}
              onCancel={onRenameComplete}
            />
          ) : (
            <span className={`text-sm ${displayKind === "floor" ? "font-semibold" : "font-medium"} ${!unit.isActive ? "opacity-40 line-through" : ""}`}>
              {unit.name}
            </span>
          )}
        </button>

        {/* Legacy badge */}
        {!isRenaming && displayKind === "legacy_location" && (
          <span
            className={`shrink-0 mr-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              isSelected ? "bg-zinc-700 text-zinc-300" : "bg-amber-50 text-amber-700"
            }`}
            title="Unassigned to a floor"
          >
            Unassigned
          </span>
        )}

        {/* Stats badge */}
        {!isRenaming && totalRooms > 0 && (
          <span className={`shrink-0 mr-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
            isSelected ? "bg-zinc-700 text-zinc-300" : "bg-zinc-100 text-zinc-500"
          }`}>
            {totalRooms}
          </span>
        )}

        {/* Context menu button */}
        {!isRenaming && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(e, { type: "unit", unit, depth });
            }}
            className={`shrink-0 rounded p-1 transition-opacity ${
              isSelected
                ? "text-zinc-400 hover:text-white opacity-100"
                : "text-zinc-400 hover:text-zinc-600 opacity-0 group-hover:opacity-100"
            }`}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Children */}
      {isExpanded && (
        <ul className="space-y-0.5">
          {unit.childUnits.map((child) => (
            <TreeUnitNode
              key={child.id}
              unit={child}
              depth={depth + 1}
              expanded={expanded}
              selection={selection}
              renaming={renaming}
              onToggle={onToggle}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onCreateUnit={onCreateUnit}
              onCreateSpace={onCreateSpace}
              onRename={onRename}
              onRenameComplete={onRenameComplete}
            />
          ))}
          {unit.childSpaces.map((space) => (
            <TreeSpaceNode
              key={space.id}
              space={space}
              unitId={unit.id}
              depth={depth + 1}
              selection={selection}
              renaming={renaming}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onRenameComplete={onRenameComplete}
            />
          ))}

          {/* Contextual add actions — role-based, never both Room+Neighborhood on every node */}
          {(showAddNeighborhood || showAddRoom) && (
            <li>
              <div
                className="flex items-center gap-1 py-0.5"
                style={{ paddingLeft: `${(depth + 1) * 20 + 28}px` }}
              >
                {showAddNeighborhood && (
                  <button
                    type="button"
                    data-testid={`add-neighborhood-${unit.id}`}
                    onClick={() => onCreateUnit(unit.id, depth + 1)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Neighborhood / Unit
                  </button>
                )}
                {showAddRoom && (
                  <button
                    type="button"
                    data-testid={`add-room-${unit.id}`}
                    onClick={() => onCreateSpace(unit.id)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Room
                  </button>
                )}
              </div>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Tree node — Space (Room)
// ---------------------------------------------------------------------------

function TreeSpaceNode({
  space,
  unitId,
  depth,
  selection,
  renaming,
  onSelect,
  onContextMenu,
  onRenameComplete,
}: {
  space: SpaceView;
  unitId: string;
  depth: number;
  selection: Selection;
  renaming: { type: "unit" | "space"; id: string } | null;
  onSelect: (s: Selection) => void;
  onContextMenu: (e: React.MouseEvent, target: ContextTarget) => void;
  onRenameComplete: () => void;
}) {
  const isSelected = selection?.type === "space" && selection.spaceId === space.id;
  const isRenaming = renaming?.type === "space" && renaming.id === space.id;
  const [isPending, startTransition] = useTransition();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: space.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={`group flex items-center rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? "bg-zinc-900 text-white"
            : "text-zinc-700 hover:bg-zinc-50"
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {/* Drag handle */}
        <button
          type="button"
          className={`shrink-0 p-1 cursor-grab opacity-0 group-hover:opacity-60 transition-opacity ${
            isSelected ? "text-zinc-400" : "text-zinc-300"
          }`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {/* Spacer matching chevron width */}
        <span className="shrink-0 w-5" />

        {/* Icon */}
        <span className={`shrink-0 mr-2 ${isSelected ? "text-zinc-400" : "text-zinc-400"}`}>
          <DoorOpen className="h-4 w-4" />
        </span>

        {/* Name */}
        <button
          type="button"
          onClick={() => onSelect({ type: "space", spaceId: space.id, unitId })}
          className="min-w-0 flex-1 truncate text-left py-2"
        >
          {isRenaming ? (
            <InlineRenameInput
              defaultValue={space.name}
              onSubmit={(name) => {
                startTransition(() => renameBuilderSpaceAction({ spaceId: space.id, name }));
                onRenameComplete();
              }}
              onCancel={onRenameComplete}
            />
          ) : (
            <span className={`text-sm ${!space.isActive ? "opacity-40 line-through" : ""}`}>
              {space.name}
            </span>
          )}
        </button>

        {/* Context menu button */}
        {!isRenaming && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(e, { type: "space", space, unitId });
            }}
            className={`shrink-0 rounded p-1 transition-opacity ${
              isSelected
                ? "text-zinc-400 hover:text-white opacity-100"
                : "text-zinc-400 hover:text-zinc-600 opacity-0 group-hover:opacity-100"
            }`}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Inline rename input
// ---------------------------------------------------------------------------

function InlineRenameInput({
  defaultValue,
  onSubmit,
  onCancel,
}: {
  defaultValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      defaultValue={defaultValue}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const val = ref.current?.value.trim();
          if (val && val !== defaultValue) onSubmit(val);
          else onCancel();
        }
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => {
        const val = ref.current?.value.trim();
        if (val && val !== defaultValue) onSubmit(val);
        else onCancel();
      }}
      className="w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none"
    />
  );
}

// ---------------------------------------------------------------------------
// Unit editor (right panel — Floor / Neighborhood)
// ---------------------------------------------------------------------------

function UnitEditor({
  unit,
  displayKind,
  allUnits,
  departments,
  onCreateSpace,
  onCreateNeighborhood,
}: {
  unit: UnitHierarchyNode;
  displayKind: BuilderNodeDisplayKind;
  allUnits: { id: string; name: string; parentUnitId: string | null }[];
  departments: { id: string; key: string; name: string }[];
  onCreateSpace: (unitId: string) => void;
  onCreateNeighborhood: (unitId: string) => void;
}) {
  const parentOptions = allUnits.filter((u) => u.id !== unit.id);
  const label = displayKindLabel(displayKind);
  const totalRooms = countSpaces(unit);
  const totalResps = unit.departmentResponsibilities.length;
  const [showResps, setShowResps] = useState(false);
  const KindIcon =
    displayKind === "floor"
      ? Building2
      : displayKind === "neighborhood"
        ? LayoutGrid
        : MapPin;

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-zinc-900">{unit.name}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <KindIcon className="h-3.5 w-3.5" />
                  {label}
                </span>
                {displayKind === "legacy_location" && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                    Unassigned to a floor
                  </span>
                )}
                {totalRooms > 0 && (
                  <span>{totalRooms} room{totalRooms !== 1 ? "s" : ""}</span>
                )}
                {unit.childUnits.length > 0 && (
                  <span>{unit.childUnits.length} neighborhood{unit.childUnits.length !== 1 ? "s" : ""}</span>
                )}
                {totalResps > 0 && (
                  <span>{totalResps} responsibilit{totalResps !== 1 ? "ies" : "y"}</span>
                )}
                {!unit.isActive && (
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-500">
                    Inactive
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {canAddNeighborhood(displayKind) && (
                <button
                  type="button"
                  onClick={() => onCreateNeighborhood(unit.id)}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Add Neighborhood / Unit
                  </span>
                </button>
              )}
              {canAddRoom(displayKind) && (
                <button
                  type="button"
                  onClick={() => onCreateSpace(unit.id)}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Add Room
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick settings */}
        <div className="border-t border-zinc-100 px-5 py-4">
          <form action={updateBuilderUnitAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="unitId" value={unit.id} />
            {displayKind === "floor" && (
              <input type="hidden" name="parentUnitId" value="" />
            )}
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Name
              <input
                name="name"
                defaultValue={unit.name}
                required
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
              />
            </label>
            {displayKind !== "floor" && (
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                Operational type
                <select
                  name="unitType"
                  defaultValue={unit.unitType}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                >
                  {UNIT_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </label>
            )}
            {displayKind !== "floor" && (
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                Parent floor
                <select
                  name="parentUnitId"
                  defaultValue={unit.parentUnitId ?? ""}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                >
                  <option value="">None (top-level)</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Display order
              <input
                type="number"
                name="displayOrder"
                defaultValue={unit.displayOrder}
                min={1}
                max={9999}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
              />
            </label>
            <label className="sm:col-span-2 flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Description
              <input
                name="description"
                defaultValue={unit.description ?? ""}
                placeholder="Optional notes"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
              <input type="checkbox" name="isActive" defaultChecked={unit.isActive} className="rounded" />
              Active
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
              >
                Save changes
              </button>
            </div>
          </form>
          <form
            action={async (formData) => {
              try {
                await deleteBuilderUnitAction(formData);
              } catch (err) {
                alert(err instanceof Error ? err.message : "Delete failed.");
              }
            }}
            className="mt-2"
          >
            <input type="hidden" name="unitId" value={unit.id} />
            <button
              type="submit"
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              onClick={(e) => {
                if (!confirm(
                  `Delete "${unit.name}"?\n\n` +
                    "Related schedules, logs, repairs, and assets for this location will also be permanently removed. " +
                    "Nested neighborhoods/rooms must be removed first. This cannot be undone.",
                )) {
                  e.preventDefault();
                }
              }}
            >
              Delete
            </button>
          </form>
        </div>
      </div>

      {/* Rooms list */}
      {unit.childSpaces.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-900">
            Rooms ({unit.childSpaces.length})
          </h3>
          <ul className="mt-2 divide-y divide-zinc-100">
            {unit.childSpaces.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <DoorOpen className="h-3.5 w-3.5 text-zinc-400" />
                  <span className={`text-zinc-800 ${!s.isActive ? "opacity-50" : ""}`}>
                    {s.name}
                  </span>
                  <span className="text-xs text-zinc-400">{SPACE_TYPE_LABELS[s.spaceType]}</span>
                </span>
                <span className="text-xs text-zinc-400">
                  {s.responsibilities.length > 0
                    ? `${s.responsibilities.length} override${s.responsibilities.length !== 1 ? "s" : ""}`
                    : "Inherits"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Department responsibilities — secondary section */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowResps(!showResps)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">Responsibilities</h3>
            {totalResps > 0 && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                {totalResps}
              </span>
            )}
          </div>
          {showResps
            ? <ChevronDown className="h-4 w-4 text-zinc-400" />
            : <ChevronRight className="h-4 w-4 text-zinc-400" />}
        </button>

        {showResps && (
          <div className="border-t border-zinc-100 px-5 py-4">
            <UnitResponsibilityEditor
              unitId={unit.id}
              responsibilities={unit.departmentResponsibilities}
              departments={departments}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Space editor (right panel — Room)
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
  const [showResps, setShowResps] = useState(false);
  const totalResps = space.responsibilities.length + parentUnit.departmentResponsibilities.length;

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="px-5 py-4">
          <h2 className="text-xl font-semibold text-zinc-900">{space.name}</h2>
          <div className="mt-1.5 flex items-center gap-3 text-sm text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <DoorOpen className="h-3.5 w-3.5" />
              Room
            </span>
            <span>in {parentUnit.name}</span>
            <span>{SPACE_TYPE_LABELS[space.spaceType]}</span>
            {!space.isActive && (
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-500">
                Inactive
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-zinc-100 px-5 py-4">
          <form action={updateBuilderSpaceAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="spaceId" value={space.id} />
            <input type="hidden" name="unitId" value={parentUnit.id} />
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Name
              <input
                name="name"
                defaultValue={space.name}
                required
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Type
              <select
                name="spaceType"
                defaultValue={space.spaceType}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
              >
                {SPACE_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{SPACE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Code
              <input
                name="code"
                defaultValue={space.code ?? ""}
                placeholder="Optional short code"
                maxLength={20}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Sort order
              <input
                type="number"
                name="sortOrder"
                defaultValue={space.sortOrder}
                min={1}
                max={9999}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
              />
            </label>
            <label className="sm:col-span-2 flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Description
              <input
                name="description"
                defaultValue={space.description ?? ""}
                placeholder="Optional notes"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
              <input type="checkbox" name="isActive" defaultChecked={space.isActive} className="rounded" />
              Active
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
              >
                Save changes
              </button>
            </div>
          </form>
          <form
            action={async (formData) => {
              try {
                await deleteBuilderSpaceAction(formData);
              } catch (err) {
                alert(err instanceof Error ? err.message : "Delete failed.");
              }
            }}
            className="mt-2"
          >
            <input type="hidden" name="spaceId" value={space.id} />
            <button
              type="submit"
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
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
      </div>

      {/* Responsibility inheritance section */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowResps(!showResps)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">Responsibilities</h3>
            {totalResps > 0 && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                {totalResps}
              </span>
            )}
          </div>
          {showResps
            ? <ChevronDown className="h-4 w-4 text-zinc-400" />
            : <ChevronRight className="h-4 w-4 text-zinc-400" />}
        </button>

        {showResps && (
          <div className="border-t border-zinc-100 px-5 py-4">
            <SpaceResponsibilityEditor
              space={space}
              parentUnit={parentUnit}
              departments={departments}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unit responsibility editor (unchanged logic, refined presentation)
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
    <div>
      <p className="text-xs text-zinc-500">
        Which departments operate here and what capabilities they have.
      </p>

      <ul className="mt-3 space-y-2">
        {responsibilities.map((r) => (
          <li key={r.id} className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm font-medium text-zinc-800">{r.department.name}</span>
                <span className="ml-1.5 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                  {KIND_LABELS[r.kind]}
                </span>
                {r.riskLevel && (
                  <span className="ml-1.5 text-xs text-zinc-500">Risk: {r.riskLevel}</span>
                )}
              </div>
              <form action={deleteBuilderUnitResponsibilityAction}>
                <input type="hidden" name="responsibilityId" value={r.id} />
                <button type="submit" className="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              </form>
            </div>
            {r.capabilities.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {r.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600"
                  >
                    {CAPABILITY_LABELS[cap as keyof typeof CAPABILITY_LABELS] ?? cap}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[10px] text-zinc-400">
                No capabilities — legacy full access
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
      className="mt-4 space-y-3 rounded-lg border border-dashed border-zinc-300 p-3"
    >
      <input type="hidden" name="unitId" value={unitId} />
      <div className="grid gap-2 sm:grid-cols-3">
        <select name="departmentId" required className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs">
          {available.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select name="kind" defaultValue="PRIMARY" className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs">
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input
          name="riskLevel"
          placeholder="Risk level (optional)"
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
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
        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
      >
        Add department
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Space responsibility editor with inheritance
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
    <div>
      <p className="text-xs text-zinc-500">
        Rooms inherit responsibilities from their neighborhood. Add an override to change capabilities at this room.
      </p>

      <ul className="mt-3 space-y-2">
        {effectiveRows.map((row) => (
          <li key={row.departmentId} className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2.5">
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
                  <button type="submit" className="text-xs text-red-600 hover:underline">
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
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600"
                  >
                    {CAPABILITY_LABELS[cap as keyof typeof CAPABILITY_LABELS] ?? cap}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[10px] text-zinc-400">
                {row.source === "inherited"
                  ? "No capabilities on parent — legacy full access"
                  : "Empty override — no operational access at this room"}
              </p>
            )}
          </li>
        ))}
        {effectiveRows.length === 0 && (
          <li className="text-xs text-zinc-500">
            No department responsibilities. Assign departments to the parent neighborhood first.
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
      className="mt-4 space-y-3 rounded-lg border border-dashed border-zinc-300 p-3"
    >
      <input type="hidden" name="spaceId" value={spaceId} />
      <p className="text-xs font-medium text-zinc-600">Add capability override</p>
      <select name="departmentId" required className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs">
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
        Leave all unchecked to explicitly remove access at this room.
      </p>
      <button
        type="submit"
        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
      >
        Add override
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Create forms
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Create forms
// ---------------------------------------------------------------------------

function CreateFloorForm({
  defaultDisplayOrder = 100,
  onDone,
}: {
  defaultDisplayOrder?: number;
  onDone: () => void;
}) {
  return (
    <form
      action={async (formData) => {
        await createBuilderFloorAction(formData);
        onDone();
      }}
      className="grid gap-3"
      data-testid="create-floor-form"
    >
      <input type="hidden" name="hierarchyIntent" value="floor" />
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Floor name
        <input
          name="name"
          required
          placeholder="e.g. First Floor, Basement"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Display order
        <input
          type="number"
          name="displayOrder"
          defaultValue={defaultDisplayOrder}
          min={1}
          max={9999}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Description
        <input
          name="description"
          placeholder="Optional"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input type="checkbox" name="isActive" defaultChecked className="rounded" />
        Active
      </label>
      <div>
        <button
          type="submit"
          data-testid="create-floor-submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          Create floor
        </button>
      </div>
    </form>
  );
}

function CreateNeighborhoodForm({
  parentId,
  onDone,
}: {
  parentId: string;
  onDone: () => void;
}) {
  return (
    <form
      action={async (formData) => {
        await createBuilderNeighborhoodAction(formData);
        onDone();
      }}
      className="grid gap-3 sm:grid-cols-2"
      data-testid="create-neighborhood-form"
    >
      <input type="hidden" name="hierarchyIntent" value="neighborhood" />
      <input type="hidden" name="parentUnitId" value={parentId} />
      <label className="sm:col-span-2 flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Neighborhood / Unit name
        <input
          name="name"
          required
          placeholder="e.g. 1A Naval Park, Wing B"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Operational type
        <select
          name="unitType"
          defaultValue="OTHER"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        >
          {UNIT_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
          ))}
        </select>
        <span className="text-[10px] font-normal text-zinc-400">
          Optional characteristic of this location (kitchen, servery, etc.)
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Display order
        <input
          type="number"
          name="displayOrder"
          defaultValue={100}
          min={1}
          max={9999}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
      </label>
      <label className="sm:col-span-2 flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Description
        <input
          name="description"
          placeholder="Optional"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
        <input type="checkbox" name="isActive" defaultChecked className="rounded" />
        Active
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          data-testid="create-neighborhood-submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          Create neighborhood / unit
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
      <label className="sm:col-span-2 flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Room name
        <input
          name="name"
          required
          placeholder="e.g. Room 32A, Servery, Soil Hold"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Type
        <select
          name="spaceType"
          defaultValue="OTHER"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        >
          {SPACE_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{SPACE_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Code
        <input
          name="code"
          placeholder="Optional short code"
          maxLength={20}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Sort order
        <input
          type="number"
          name="sortOrder"
          defaultValue={100}
          min={1}
          max={9999}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Description
        <input
          name="description"
          placeholder="Optional"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
        <input type="checkbox" name="isActive" defaultChecked className="rounded" />
        Active
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          Create room
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

function findSpaceWithParent(
  units: UnitHierarchyNode[],
  spaceId: string,
): { space: SpaceView; parentUnitId: string } | null {
  for (const u of units) {
    const s = u.childSpaces.find((s) => s.id === spaceId);
    if (s) return { space: s, parentUnitId: u.id };
    const found = findSpaceWithParent(u.childUnits, spaceId);
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

function countSpaces(unit: UnitHierarchyNode): number {
  let count = unit.childSpaces.length;
  for (const child of unit.childUnits) {
    count += countSpaces(child);
  }
  return count;
}

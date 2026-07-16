"use client";

import {
  useState,
  useRef,
  useEffect,
  useTransition,
  useMemo,
  useContext,
  createContext,
  type ReactNode,
} from "react";
import { UnitDepartmentKind, type UnitType } from "@prisma/client";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
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
  Search,
  ArrowRightLeft,
  ListPlus,
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
  PLANT_FACILITY_WIDE_ACCESS_NOTE,
  ROOM_RESPONSIBILITY_EMPTY_MESSAGE,
  formatRoomDisplayName,
} from "@/lib/facility-builder/load-facility-hierarchy";
import {
  resolveBuilderNodeDisplayKind,
  displayKindLabel,
  canAddNeighborhood,
  canAddRoom,
  canMoveUnitOnto,
  canMoveRoomOnto,
  UNDESIGNATED_DROP_ID,
  type BuilderNodeDisplayKind,
} from "@/lib/facility-builder/builder-display";
import {
  BULK_ROOM_MAX,
  filterHierarchyForSearch,
  listFloorMoveDestinations,
  listRoomMoveDestinations,
  reorderSiblingIds,
  shouldReorderUnitsAsSiblings,
  splitHighlightParts,
} from "@/lib/facility-builder/builder-setup";
import {
  SPACE_TYPE_PRESETS,
  CUSTOM_SPACE_PRESET_KEY,
  findPresetForStoredSpace,
  resolveSpaceTypeDisplayLabel,
} from "@/lib/facility-builder/space-type-presets";
import {
  listPresetsForDepartment,
  recommendResponsibilityPresetKey,
  capabilitiesForPreset,
} from "@/lib/facility-builder/department-responsibility-presets";
import { unitTypeLabel } from "@/lib/unit-type-config";
import {
  buildBuilderCopy,
  DEFAULT_BUILDER_COPY,
  type BuilderCopy,
} from "@/lib/facility-builder/facility-vocabulary";
import {
  createBuilderFloorAction,
  createBuilderNeighborhoodAction,
  updateBuilderUnitAction,
  deleteBuilderUnitAction,
  createBuilderSpaceAction,
  createBuilderSpacesBulkAction,
  updateBuilderSpaceAction,
  deleteBuilderSpaceAction,
  upsertBuilderUnitResponsibilityAction,
  deleteBuilderUnitResponsibilityAction,
  upsertBuilderSpaceResponsibilityAction,
  deleteBuilderSpaceResponsibilityAction,
  moveBuilderUnitAction,
  moveBuilderSpaceAction,
  reorderBuilderUnitsAction,
  reorderBuilderSpacesAction,
  renameBuilderUnitAction,
  renameBuilderSpaceAction,
  toggleBuilderUnitActiveAction,
  convertBuilderLegacyToFloorAction,
} from "./actions";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNIT_TYPE_OPTIONS: UnitType[] = [
  "OTHER", "SERVERY", "KITCHEN", "RETAIL", "OFFICE", "STORAGE",
  "RESIDENT_AREA", "COMMON_AREA", "MECHANICAL", "RESTROOM_CLUSTER",
  "EVS_ZONE", "GROUND",
];

const KIND_LABELS: Record<UnitDepartmentKind, string> = {
  PRIMARY: "Primary",
  BACKUP: "Backup",
  SUPPORT: "Support",
};

/** Facility vocabulary copy — provided once at the builder root; consumed everywhere. */
const BuilderCopyContext = createContext<BuilderCopy>(DEFAULT_BUILDER_COPY);

function useBuilderCopy(): BuilderCopy {
  return useContext(BuilderCopyContext);
}

type Selection =
  | { type: "unit"; unitId: string }
  | { type: "space"; spaceId: string; unitId: string | null }
  | null;

type CreateUnitDrawerState = {
  parentId: string | null;
  depth: number;
  intent?: "floor" | "neighborhood";
};

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function FacilityBuilderClient({ hierarchy }: { hierarchy: FacilityHierarchy }) {
  const copy = useMemo(
    () => buildBuilderCopy(hierarchy.vocabulary),
    [hierarchy.vocabulary],
  );
  const [selection, setSelection] = useState<Selection>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const u of hierarchy.units) set.add(u.id);
    return set;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [createUnitDrawer, setCreateUnitDrawer] = useState<CreateUnitDrawerState | null>(null);
  const [createSpaceDrawer, setCreateSpaceDrawer] = useState<{ unitId?: string | null } | null>(null);
  const [bulkSpaceDrawer, setBulkSpaceDrawer] = useState<{ unitId: string } | null>(null);
  const [moveDrawer, setMoveDrawer] = useState<
    | { type: "unit-to-floor"; unitId: string; unitName: string; currentParentId: string | null }
    | { type: "space-to-neighborhood"; spaceId: string; spaceName: string; currentUnitId: string | null }
    | null
  >(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: { type: "unit"; unit: UnitHierarchyNode; depth: number } | { type: "space"; space: SpaceView; unitId: string | null };
  } | null>(null);
  const [renaming, setRenaming] = useState<{ type: "unit"; id: string } | { type: "space"; id: string } | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const isSearching = searchQuery.trim().length > 0;
  const searchResult = useMemo(
    () => filterHierarchyForSearch(hierarchy.units, searchQuery),
    [hierarchy.units, searchQuery],
  );
  const stagedSearchResult = useMemo(
    () => filterHierarchyForSearch(hierarchy.stagedUnits, searchQuery),
    [hierarchy.stagedUnits, searchQuery],
  );
  const filteredUndesignatedSpaces = useMemo(
    () => filterUndesignatedSpaces(hierarchy.undesignatedSpaces, searchQuery),
    [hierarchy.undesignatedSpaces, searchQuery],
  );
  const displayUnits = isSearching ? searchResult.units : hierarchy.units;
  const displayStagedUnits = isSearching ? stagedSearchResult.units : hierarchy.stagedUnits;
  const displayUndesignatedSpaces = filteredUndesignatedSpaces;
  const effectiveExpanded = isSearching
    ? new Set([...searchResult.expandedIds, ...stagedSearchResult.expandedIds])
    : expanded;
  const showUndesignatedSection =
    !isSearching ||
    displayStagedUnits.length > 0 ||
    displayUndesignatedSpaces.length > 0;
  const undesignatedCount = hierarchy.stagedUnits.length + hierarchy.undesignatedSpaces.length;

  function toggleExpand(id: string) {
    if (isSearching) return;
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
    ? findUnitInHierarchy(hierarchy, selection.unitId)
    : null;
  const selectedSpace = selection?.type === "space"
    ? findSpaceInHierarchy(hierarchy, selection.spaceId)
    : null;
  const parentUnitOfSpace = selection?.type === "space" && selection.unitId
    ? findUnitInHierarchy(hierarchy, selection.unitId)
    : null;

  const allFlatUnits = flattenUnits(hierarchy.units, hierarchy.stagedUnits);

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    if (isSearching) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeUnit = findUnitInHierarchy(hierarchy, activeId);
    const activeSpaceInfo = findSpaceWithParentInHierarchy(hierarchy, activeId);
    const overUnit = findUnitInHierarchy(hierarchy, overId);
    const overSpaceInfo = findSpaceWithParentInHierarchy(hierarchy, overId);

    // Drop onto Undesignated staging zone
    if (overId === UNDESIGNATED_DROP_ID) {
      if (activeUnit && resolveBuilderNodeDisplayKind(activeUnit) !== "floor") {
        startTransition(() => {
          moveBuilderUnitAction({
            unitId: activeUnit.id,
            newParentUnitId: null,
            newDisplayOrder: 100,
          });
        });
      } else if (activeSpaceInfo) {
        startTransition(() => {
          moveBuilderSpaceAction({
            spaceId: activeSpaceInfo.space.id,
            newUnitId: null,
            newSortOrder: 100,
          });
        });
      }
      return;
    }

    // --- Unit drag ---
    if (activeUnit) {
      // Sibling reorder among staged units (Undesignated)
      if (
        overUnit &&
        resolveBuilderNodeDisplayKind(activeUnit) === "staged" &&
        resolveBuilderNodeDisplayKind(overUnit) === "staged" &&
        activeUnit.parentUnitId === null &&
        overUnit.parentUnitId === null
      ) {
        const siblings = hierarchy.stagedUnits;
        const ordered = reorderSiblingIds(
          siblings.map((s) => s.id),
          activeUnit.id,
          overUnit.id,
        );
        if (!ordered) return;
        startTransition(() => {
          reorderBuilderUnitsAction({
            parentUnitId: null,
            orderedIds: ordered,
          });
        });
        return;
      }

      // Sibling reorder (Floor↔Floor, Neighborhood↔Neighborhood, Legacy↔Legacy)
      if (overUnit && shouldReorderUnitsAsSiblings(activeUnit, overUnit)) {
        const activeKind = resolveBuilderNodeDisplayKind(activeUnit);
        const siblings = getSiblingUnits(hierarchy.units, activeUnit.parentUnitId).filter(
          (s) => resolveBuilderNodeDisplayKind(s) === activeKind,
        );
        const ordered = reorderSiblingIds(
          siblings.map((s) => s.id),
          activeUnit.id,
          overUnit.id,
        );
        if (!ordered) return;
        startTransition(() => {
          reorderBuilderUnitsAction({
            parentUnitId: activeUnit.parentUnitId,
            orderedIds: ordered,
          });
        });
        return;
      }

      // Reparent onto a Floor
      if (overUnit) {
        const dragKind = resolveBuilderNodeDisplayKind(activeUnit);
        const dropKind = resolveBuilderNodeDisplayKind(overUnit);
        if (!canMoveUnitOnto(dragKind, dropKind)) return;
        if (overUnit.id === activeUnit.parentUnitId) return;
        startTransition(() => {
          moveBuilderUnitAction({
            unitId: activeUnit.id,
            newParentUnitId: overUnit.id,
            newDisplayOrder: 100,
          });
        });
        expandTo(overUnit.id);
      }
      return;
    }

    // --- Space (room) drag ---
    if (activeSpaceInfo) {
      // Reorder among undesignated rooms
      if (
        overSpaceInfo &&
        activeSpaceInfo.parentUnitId === null &&
        overSpaceInfo.parentUnitId === null
      ) {
        const ordered = reorderSiblingIds(
          hierarchy.undesignatedSpaces.map((s) => s.id),
          activeSpaceInfo.space.id,
          overSpaceInfo.space.id,
        );
        if (!ordered) return;
        startTransition(() => {
          reorderBuilderSpacesAction({
            unitId: null,
            orderedIds: ordered,
          });
        });
        return;
      }

      // Reorder among rooms in the same neighborhood / unit
      if (
        overSpaceInfo &&
        overSpaceInfo.parentUnitId === activeSpaceInfo.parentUnitId &&
        activeSpaceInfo.parentUnitId !== null
      ) {
        const parent = findUnitInHierarchy(hierarchy, activeSpaceInfo.parentUnitId);
        if (!parent) return;
        const ordered = reorderSiblingIds(
          parent.childSpaces.map((s) => s.id),
          activeSpaceInfo.space.id,
          overSpaceInfo.space.id,
        );
        if (!ordered) return;
        startTransition(() => {
          reorderBuilderSpacesAction({
            unitId: activeSpaceInfo.parentUnitId,
            orderedIds: ordered,
          });
        });
        return;
      }

      // Move onto a different neighborhood / floor (drop on unit or on a room in that unit)
      const targetUnit = overUnit
        ?? (overSpaceInfo?.parentUnitId
          ? findUnitInHierarchy(hierarchy, overSpaceInfo.parentUnitId)
          : null);
      if (!targetUnit) return;
      const dropKind = resolveBuilderNodeDisplayKind(targetUnit);
      if (!canMoveRoomOnto(dropKind)) return;
      if (targetUnit.id === activeSpaceInfo.parentUnitId) return;
      startTransition(() => {
        moveBuilderSpaceAction({
          spaceId: activeSpaceInfo.space.id,
          newUnitId: targetUnit.id,
          newSortOrder: 100,
        });
      });
      expandTo(targetUnit.id);
    }
  }

  const hasAnyUnits = hierarchy.units.length > 0;
  const hasFloors = hierarchy.units.some((u) => resolveBuilderNodeDisplayKind(u) === "floor");

  function openAddFloor() {
    setCreateUnitDrawer({ parentId: null, depth: 0, intent: "floor" });
  }

  function openAddNeighborhood() {
    setCreateUnitDrawer({ parentId: null, depth: 0, intent: "neighborhood" });
  }

  function openAddRoom() {
    setCreateSpaceDrawer({ unitId: null });
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

  void isPending;

  return (
    <BuilderCopyContext.Provider value={copy}>
    <DndContext
      id="facility-builder"
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

          {/* Toolbar: Search + Add Floor / Neighborhood / Room */}
          <div className="space-y-2 border-b border-zinc-100 px-2 py-2">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={copy.toolbar.searchPlaceholder}
                data-testid="hierarchy-search"
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-8 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none"
              />
            </label>
            <div className="flex gap-1.5">
              <button
                type="button"
                data-testid="add-floor-root"
                onClick={openAddFloor}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-2 py-2 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {copy.toolbar.addLevel1}
              </button>
              <button
                type="button"
                data-testid="add-neighborhood-root"
                onClick={openAddNeighborhood}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {copy.toolbar.addLevel2}
              </button>
              <button
                type="button"
                data-testid="add-room-root"
                onClick={openAddRoom}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {copy.toolbar.addLevel3}
              </button>
            </div>
          </div>

          <div className="max-h-[calc(70vh-4rem)] overflow-y-auto px-1 py-1.5">
            {showUndesignatedSection && (
              <UndesignatedSection
                stagedUnits={displayStagedUnits}
                undesignatedSpaces={displayUndesignatedSpaces}
                undesignatedCount={undesignatedCount}
                expanded={effectiveExpanded}
                selection={selection}
                renaming={renaming}
                searchQuery={searchQuery}
                dndEnabled={!isSearching}
                onToggle={toggleExpand}
                onSelect={setSelection}
                onContextMenu={(e, target) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, target });
                }}
                onCreateUnit={(parentId, depth) =>
                  setCreateUnitDrawer({ parentId, depth, intent: "neighborhood" })
                }
                onCreateSpace={(unitId) => setCreateSpaceDrawer({ unitId })}
                onBulkCreateSpace={(unitId) => setBulkSpaceDrawer({ unitId })}
                onRename={setRenaming}
                onRenameComplete={() => setRenaming(null)}
              />
            )}

            {!hasAnyUnits ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-medium text-zinc-700">{copy.tree.emptyTitle}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  {copy.tree.emptyBody}
                </p>
                <button
                  type="button"
                  data-testid="add-floor-empty"
                  onClick={openAddFloor}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  <Plus className="h-4 w-4" />
                  {copy.tree.emptyAction}
                </button>
              </div>
            ) : isSearching && displayUnits.length === 0 && !showUndesignatedSection ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-zinc-700">{copy.tree.noSearchResults}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {copy.tree.noSearchResultsHint}
                </p>
              </div>
            ) : (
              <>
                {!hasFloors && !isSearching && (
                  <p className="mx-2 mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {copy.tree.legacyTopLevelHint}
                  </p>
                )}
                <SortableContext
                  items={displayUnits.map((u) => u.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="space-y-0.5">
                    {displayUnits.map((unit) => (
                      <TreeUnitNode
                        key={unit.id}
                        unit={unit}
                        depth={0}
                        expanded={effectiveExpanded}
                        selection={selection}
                        renaming={renaming}
                        searchQuery={searchQuery}
                        dndEnabled={!isSearching}
                        onToggle={toggleExpand}
                        onSelect={setSelection}
                        onContextMenu={(e, target) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY, target });
                        }}
                        onCreateUnit={(parentId, depth) =>
                          setCreateUnitDrawer({ parentId, depth, intent: "neighborhood" })
                        }
                        onCreateSpace={(unitId) => setCreateSpaceDrawer({ unitId })}
                        onBulkCreateSpace={(unitId) => setBulkSpaceDrawer({ unitId })}
                        onRename={setRenaming}
                        onRenameComplete={() => setRenaming(null)}
                      />
                    ))}
                  </ul>
                </SortableContext>
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
                {copy.tree.selectPrompt}
              </p>
              <button
                type="button"
                data-testid="add-floor-editor-empty"
                onClick={openAddFloor}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                <Plus className="h-4 w-4" />
                {copy.tree.emptyAction}
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
              onBulkCreateSpace={(unitId) => setBulkSpaceDrawer({ unitId })}
              onCreateNeighborhood={(unitId) =>
                setCreateUnitDrawer({ parentId: unitId, depth: 1, intent: "neighborhood" })
              }
            />
          )}

          {selectedSpace && (
            <SpaceEditor
              space={selectedSpace}
              parentUnit={parentUnitOfSpace}
              departments={hierarchy.departments}
              isUndesignated={selection?.type === "space" && !selection.unitId}
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
                setCreateUnitDrawer({
                  parentId: target.unit.id,
                  depth: target.depth + 1,
                  intent: "neighborhood",
                });
              }
              setContextMenu(null);
            }}
            onAddRoom={(target) => {
              if (target.type === "unit") {
                setCreateSpaceDrawer({ unitId: target.unit.id });
              }
              setContextMenu(null);
            }}
            onBulkAddRooms={(target) => {
              if (target.type === "unit") {
                setBulkSpaceDrawer({ unitId: target.unit.id });
              }
              setContextMenu(null);
            }}
            onMove={(target) => {
              if (target.type === "unit") {
                const kind = resolveBuilderNodeDisplayKind(target.unit);
                if (kind === "legacy_location" || kind === "neighborhood" || kind === "staged") {
                  setMoveDrawer({
                    type: "unit-to-floor",
                    unitId: target.unit.id,
                    unitName: target.unit.name,
                    currentParentId: target.unit.parentUnitId,
                  });
                }
              } else {
                setMoveDrawer({
                  type: "space-to-neighborhood",
                  spaceId: target.space.id,
                  spaceName: target.space.name,
                  currentUnitId: target.unitId,
                });
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
                if (!confirm(copy.editor.deleteConfirm(target.unit.name))) return;
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
            expanded={effectiveExpanded}
            onToggleExpand={toggleExpand}
          />
        )}

        {/* Create unit drawer */}
        {createUnitDrawer && (
          <Drawer
            open
            onClose={() => setCreateUnitDrawer(null)}
            title={
              createUnitDrawer.intent === "floor"
                ? copy.drawers.addLevel1
                : copy.drawers.addLevel2
            }
          >
            {createUnitDrawer.intent === "floor" ? (
              <CreateFloorForm
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
            title={copy.drawers.addLevel3}
          >
            <CreateSpaceForm
              unitId={createSpaceDrawer.unitId ?? null}
              onDone={() => setCreateSpaceDrawer(null)}
            />
          </Drawer>
        )}

        {/* Bulk rooms drawer */}
        {bulkSpaceDrawer && (
          <Drawer
            open
            onClose={() => setBulkSpaceDrawer(null)}
            title={copy.drawers.addLevel3Bulk}
          >
            <BulkCreateSpacesForm
              unitId={bulkSpaceDrawer.unitId}
              onDone={() => setBulkSpaceDrawer(null)}
            />
          </Drawer>
        )}

        {/* Move picker drawer */}
        {moveDrawer && (
          <Drawer
            open
            onClose={() => setMoveDrawer(null)}
            title={
              moveDrawer.type === "unit-to-floor"
                ? copy.drawers.moveToLevel1
                : copy.drawers.moveToLevel2
            }
          >
            {moveDrawer.type === "unit-to-floor" ? (
              <MoveUnitToFloorForm
                unitId={moveDrawer.unitId}
                unitName={moveDrawer.unitName}
                currentParentId={moveDrawer.currentParentId}
                floors={listFloorMoveDestinations(hierarchy.units, {
                  excludeUnitId: moveDrawer.unitId,
                  excludeParentId: moveDrawer.currentParentId,
                })}
                allowUndesignated={moveDrawer.currentParentId != null}
                onDone={() => setMoveDrawer(null)}
              />
            ) : (
              <MoveSpaceToNeighborhoodForm
                spaceId={moveDrawer.spaceId}
                spaceName={moveDrawer.spaceName}
                currentUnitId={moveDrawer.currentUnitId}
                destinations={listRoomMoveDestinations(
                  hierarchy.units,
                  hierarchy.stagedUnits,
                  {
                    excludeUnitId: moveDrawer.currentUnitId,
                    includeUndesignated: moveDrawer.currentUnitId != null,
                  },
                )}
                onDone={() => setMoveDrawer(null)}
              />
            )}
          </Drawer>
        )}
      </div>

      <DragOverlay>
        {activeDragId && (
          <div className="rounded-md bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-lg border border-zinc-200">
            {findUnitInHierarchy(hierarchy, activeDragId)?.name ??
              findSpaceInHierarchy(hierarchy, activeDragId)?.name ??
              "Moving..."}
          </div>
        )}
      </DragOverlay>
    </DndContext>
    </BuilderCopyContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Undesignated staging section
// ---------------------------------------------------------------------------

function UndesignatedSection({
  stagedUnits,
  undesignatedSpaces,
  undesignatedCount,
  expanded,
  selection,
  renaming,
  searchQuery,
  dndEnabled,
  onToggle,
  onSelect,
  onContextMenu,
  onCreateUnit,
  onCreateSpace,
  onBulkCreateSpace,
  onRename,
  onRenameComplete,
}: {
  stagedUnits: UnitHierarchyNode[];
  undesignatedSpaces: SpaceView[];
  undesignatedCount: number;
  expanded: Set<string>;
  selection: Selection;
  renaming: { type: "unit" | "space"; id: string } | null;
  searchQuery: string;
  dndEnabled: boolean;
  onToggle: (id: string) => void;
  onSelect: (s: Selection) => void;
  onContextMenu: (e: React.MouseEvent, target: ContextTarget) => void;
  onCreateUnit: (parentId: string, depth: number) => void;
  onCreateSpace: (unitId: string) => void;
  onBulkCreateSpace: (unitId: string) => void;
  onRename: (r: { type: "unit" | "space"; id: string }) => void;
  onRenameComplete: () => void;
}) {
  const copy = useBuilderCopy();
  const { setNodeRef, isOver } = useDroppable({
    id: UNDESIGNATED_DROP_ID,
    disabled: !dndEnabled,
  });

  const hasItems = stagedUnits.length > 0 || undesignatedSpaces.length > 0;

  return (
    <div
      ref={setNodeRef}
      data-testid="undesignated-section"
      className={`mb-2 rounded-lg border px-1 py-1.5 transition-colors ${
        isOver
          ? "border-amber-300 bg-amber-50/60"
          : "border-zinc-200 bg-zinc-50/50"
      }`}
    >
      {undesignatedCount > 0 && (
        <div className="mx-1 mb-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-900">
            {copy.undesignatedSection.warningTitle}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800/90">
            {copy.undesignatedSection.warningBody}
          </p>
        </div>
      )}

      {!hasItems && (
        <p className="px-2 py-1.5 text-[11px] text-zinc-400">
          {copy.undesignatedSection.dropHint}
        </p>
      )}

      {stagedUnits.length > 0 && (
        <SortableContext
          items={stagedUnits.map((u) => u.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-0.5">
            {stagedUnits.map((unit) => (
              <TreeUnitNode
                key={unit.id}
                unit={unit}
                depth={0}
                expanded={expanded}
                selection={selection}
                renaming={renaming}
                searchQuery={searchQuery}
                dndEnabled={dndEnabled}
                onToggle={onToggle}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
                onCreateUnit={onCreateUnit}
                onCreateSpace={onCreateSpace}
                onBulkCreateSpace={onBulkCreateSpace}
                onRename={onRename}
                onRenameComplete={onRenameComplete}
              />
            ))}
          </ul>
        </SortableContext>
      )}

      {undesignatedSpaces.length > 0 && (
        <SortableContext
          items={undesignatedSpaces.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-0.5">
            {undesignatedSpaces.map((space) => (
              <TreeSpaceNode
                key={space.id}
                space={space}
                unitId={null}
                depth={0}
                selection={selection}
                renaming={renaming}
                searchQuery={searchQuery}
                dndEnabled={dndEnabled}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
                onRenameComplete={onRenameComplete}
              />
            ))}
          </ul>
        </SortableContext>
      )}
    </div>
  );
}

function NotYetPlacedBanner() {
  const copy = useBuilderCopy();
  return (
    <div className="rounded-lg border border-amber-200/80 bg-amber-50 px-4 py-3">
      <p className="text-sm font-medium text-amber-900">{copy.undesignatedSection.bannerTitle}</p>
      <p className="mt-0.5 text-xs text-amber-800/90">
        {copy.undesignatedSection.bannerBody}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context menu overlay
// ---------------------------------------------------------------------------

type ContextTarget =
  | { type: "unit"; unit: UnitHierarchyNode; depth: number }
  | { type: "space"; space: SpaceView; unitId: string | null };

function ContextMenuOverlay({
  x,
  y,
  target,
  onClose,
  onRename,
  onAddChild,
  onAddRoom,
  onBulkAddRooms,
  onMove,
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
  onBulkAddRooms: (t: ContextTarget) => void;
  onMove: (t: ContextTarget) => void;
  onToggleActive: (t: ContextTarget) => void;
  onConvertToFloor: (t: ContextTarget) => void;
  onDelete: (t: ContextTarget) => void;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
}) {
  const copy = useBuilderCopy();
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
      className="fixed z-50 min-w-[200px] rounded-lg border border-zinc-200 bg-white py-1 shadow-xl"
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
                {copy.contextMenu.convertToLevel1}
              </ContextMenuItem>
              <ContextMenuItem
                icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
                onClick={() => onMove(target)}
              >
                {copy.contextMenu.moveToLevel1}
              </ContextMenuItem>
            </>
          )}

          {displayKind === "neighborhood" && (
            <>
              <div className="my-1 border-t border-zinc-100" />
              <ContextMenuItem
                icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
                onClick={() => onMove(target)}
              >
                {copy.contextMenu.moveToAnotherLevel1}
              </ContextMenuItem>
            </>
          )}

          {displayKind === "staged" && (
            <>
              <div className="my-1 border-t border-zinc-100" />
              <ContextMenuItem
                icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
                onClick={() => onMove(target)}
              >
                {copy.contextMenu.moveToLevel1}
              </ContextMenuItem>
            </>
          )}

          {(canAddNeighborhood(displayKind!) || canAddRoom(displayKind!)) && (
            <>
              <div className="my-1 border-t border-zinc-100" />

              {canAddNeighborhood(displayKind!) && (
                <ContextMenuItem icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onAddChild(target)}>
                  {copy.contextMenu.addLevel2}
                </ContextMenuItem>
              )}

              {canAddRoom(displayKind!) && (
                <>
                  <ContextMenuItem icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onAddRoom(target)}>
                    {copy.contextMenu.addLevel3}
                  </ContextMenuItem>
                  <ContextMenuItem icon={<ListPlus className="h-3.5 w-3.5" />} onClick={() => onBulkAddRooms(target)}>
                    {copy.contextMenu.addLevel3Bulk}
                  </ContextMenuItem>
                </>
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

      {!isUnit && (
        <>
          <div className="my-1 border-t border-zinc-100" />
          <ContextMenuItem
            icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
            onClick={() => onMove(target)}
          >
            {copy.contextMenu.moveToAnotherLevel2}
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
  searchQuery,
  dndEnabled,
  onToggle,
  onSelect,
  onContextMenu,
  onCreateUnit,
  onCreateSpace,
  onBulkCreateSpace,
  onRename,
  onRenameComplete,
}: {
  unit: UnitHierarchyNode;
  depth: number;
  expanded: Set<string>;
  selection: Selection;
  renaming: { type: "unit" | "space"; id: string } | null;
  searchQuery: string;
  dndEnabled: boolean;
  onToggle: (id: string) => void;
  onSelect: (s: Selection) => void;
  onContextMenu: (e: React.MouseEvent, target: ContextTarget) => void;
  onCreateUnit: (parentId: string, depth: number) => void;
  onCreateSpace: (unitId: string) => void;
  onBulkCreateSpace: (unitId: string) => void;
  onRename: (r: { type: "unit" | "space"; id: string }) => void;
  onRenameComplete: () => void;
}) {
  const copy = useBuilderCopy();
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
  } = useSortable({ id: unit.id, disabled: !dndEnabled });

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
        : displayKind === "staged"
          ? MapPin
          : MapPin;

  void isPending;

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
        <button
          type="button"
          className={`shrink-0 p-1 cursor-grab opacity-0 group-hover:opacity-60 transition-opacity ${
            isSelected ? "text-zinc-400" : "text-zinc-300"
          } ${!dndEnabled ? "invisible" : ""}`}
          {...(dndEnabled ? { ...attributes, ...listeners } : {})}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

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

        <span className={`shrink-0 mr-2 ${isSelected ? "text-zinc-400" : "text-zinc-400"}`}>
          <KindIcon className="h-4 w-4" />
        </span>

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
              <HighlightedText text={unit.name} query={searchQuery} selected={isSelected} />
            </span>
          )}
        </button>

        {!isRenaming && displayKind === "legacy_location" && (
          <span
            className={`shrink-0 mr-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              isSelected ? "bg-zinc-700 text-zinc-300" : "bg-amber-50 text-amber-700"
            }`}
            title={copy.tree.unassignedTitle}
          >
            {copy.tree.unassignedBadge}
          </span>
        )}

        {!isRenaming && displayKind === "staged" && (
          <span
            className={`shrink-0 mr-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              isSelected ? "bg-zinc-700 text-zinc-300" : "bg-amber-50 text-amber-700"
            }`}
            title={copy.tree.stagedTitle}
          >
            {copy.tree.stagedBadge}
          </span>
        )}

        {!isRenaming && totalRooms > 0 && (
          <span className={`shrink-0 mr-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
            isSelected ? "bg-zinc-700 text-zinc-300" : "bg-zinc-100 text-zinc-500"
          }`}>
            {totalRooms}
          </span>
        )}

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

      {isExpanded && (
        <ul className="space-y-0.5">
          {unit.childUnits.length > 0 && (
            <SortableContext
              items={unit.childUnits.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {unit.childUnits.map((child) => (
                <TreeUnitNode
                  key={child.id}
                  unit={child}
                  depth={depth + 1}
                  expanded={expanded}
                  selection={selection}
                  renaming={renaming}
                  searchQuery={searchQuery}
                  dndEnabled={dndEnabled}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onContextMenu={onContextMenu}
                  onCreateUnit={onCreateUnit}
                  onCreateSpace={onCreateSpace}
                  onBulkCreateSpace={onBulkCreateSpace}
                  onRename={onRename}
                  onRenameComplete={onRenameComplete}
                />
              ))}
            </SortableContext>
          )}
          {unit.childSpaces.length > 0 && (
            <SortableContext
              items={unit.childSpaces.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {unit.childSpaces.map((space) => (
                <TreeSpaceNode
                  key={space.id}
                  space={space}
                  unitId={unit.id}
                  depth={depth + 1}
                  selection={selection}
                  renaming={renaming}
                  searchQuery={searchQuery}
                  dndEnabled={dndEnabled}
                  onSelect={onSelect}
                  onContextMenu={onContextMenu}
                  onRenameComplete={onRenameComplete}
                />
              ))}
            </SortableContext>
          )}

          {(showAddNeighborhood || showAddRoom) && (
            <li>
              <div
                className="flex flex-wrap items-center gap-1 py-0.5"
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
                    {copy.labels.level2}
                  </button>
                )}
                {showAddRoom && (
                  <>
                    <button
                      type="button"
                      data-testid={`add-room-${unit.id}`}
                      onClick={() => onCreateSpace(unit.id)}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      {copy.labels.level3}
                    </button>
                    <button
                      type="button"
                      data-testid={`add-rooms-bulk-${unit.id}`}
                      onClick={() => onBulkCreateSpace(unit.id)}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 transition-colors"
                    >
                      <ListPlus className="h-3 w-3" />
                      Multiple
                    </button>
                  </>
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
  searchQuery,
  dndEnabled,
  onSelect,
  onContextMenu,
  onRenameComplete,
}: {
  space: SpaceView;
  unitId: string | null;
  depth: number;
  selection: Selection;
  renaming: { type: "unit" | "space"; id: string } | null;
  searchQuery: string;
  dndEnabled: boolean;
  onSelect: (s: Selection) => void;
  onContextMenu: (e: React.MouseEvent, target: ContextTarget) => void;
  onRenameComplete: () => void;
}) {
  const isSelected = selection?.type === "space" && selection.spaceId === space.id;
  const isRenaming = renaming?.type === "space" && renaming.id === space.id;
  const [, startTransition] = useTransition();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: space.id, disabled: !dndEnabled });

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
        <button
          type="button"
          className={`shrink-0 p-1 cursor-grab opacity-0 group-hover:opacity-60 transition-opacity ${
            isSelected ? "text-zinc-400" : "text-zinc-300"
          } ${!dndEnabled ? "invisible" : ""}`}
          {...(dndEnabled ? { ...attributes, ...listeners } : {})}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <span className="shrink-0 w-5" />

        <span className={`shrink-0 mr-2 ${isSelected ? "text-zinc-400" : "text-zinc-400"}`}>
          <DoorOpen className="h-4 w-4" />
        </span>

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
              <HighlightedText
                text={formatRoomDisplayName(space)}
                query={searchQuery}
                selected={isSelected}
              />
            </span>
          )}
        </button>

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
  onBulkCreateSpace,
  onCreateNeighborhood,
}: {
  unit: UnitHierarchyNode;
  displayKind: BuilderNodeDisplayKind;
  allUnits: { id: string; name: string; parentUnitId: string | null }[];
  departments: { id: string; key: string; name: string }[];
  onCreateSpace: (unitId: string) => void;
  onBulkCreateSpace: (unitId: string) => void;
  onCreateNeighborhood: (unitId: string) => void;
}) {
  const copy = useBuilderCopy();
  const label = displayKindLabel(displayKind, copy);
  const totalRooms = countSpaces(unit);
  const totalResps = unit.departmentResponsibilities.length;
  const [showResps, setShowResps] = useState(false);
  void allUnits;
  const KindIcon =
    displayKind === "floor"
      ? Building2
      : displayKind === "neighborhood"
        ? LayoutGrid
        : displayKind === "staged"
          ? MapPin
          : MapPin;

  return (
    <div className="space-y-4">
      {displayKind === "staged" && <NotYetPlacedBanner />}

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
                    {copy.editor.unassignedToLevel1}
                  </span>
                )}
                {displayKind === "staged" && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                    {copy.labels.undesignated}
                  </span>
                )}
                {totalRooms > 0 && (
                  <span>{copy.editor.level3Count(totalRooms)}</span>
                )}
                {unit.childUnits.length > 0 && (
                  <span>{copy.editor.level2Count(unit.childUnits.length)}</span>
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
                    {copy.editor.addLevel2}
                  </span>
                </button>
              )}
              {canAddRoom(displayKind) && (
                <>
                  <button
                    type="button"
                    onClick={() => onCreateSpace(unit.id)}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      {copy.editor.addLevel3}
                    </span>
                  </button>
                  <button
                    type="button"
                    data-testid="add-multiple-rooms-editor"
                    onClick={() => onBulkCreateSpace(unit.id)}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <ListPlus className="h-3.5 w-3.5" />
                      {copy.editor.addLevel3Bulk}
                    </span>
                  </button>
                </>
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
            {displayKind !== "floor" && unit.parentUnitId && (
              <input type="hidden" name="parentUnitId" value={unit.parentUnitId} />
            )}
            <label className="sm:col-span-2 flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Name
              <input
                name="name"
                defaultValue={unit.name}
                required
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

            {displayKind !== "floor" && (
              <details className="sm:col-span-2 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-zinc-600">
                  Advanced operational settings
                </summary>
                <div className="mt-3 space-y-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                    Legacy operational type
                    <select
                      name="unitType"
                      defaultValue={unit.unitType}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                    >
                      {UNIT_TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>{unitTypeLabel(t)}</option>
                      ))}
                    </select>
                    <span className="text-[10px] font-normal text-zinc-400">
                      Used by older operational workflows. Most locations can remain General.
                    </span>
                  </label>
                </div>
              </details>
            )}

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
                if (!confirm(copy.editor.deleteConfirm(unit.name))) {
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
            {copy.editor.level3ListTitle(unit.childSpaces.length)}
          </h3>
          <ul className="mt-2 divide-y divide-zinc-100">
            {unit.childSpaces.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <DoorOpen className="h-3.5 w-3.5 text-zinc-400" />
                  <span className={`text-zinc-800 ${!s.isActive ? "opacity-50" : ""}`}>
                    {formatRoomDisplayName(s)}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {resolveSpaceTypeDisplayLabel({
                      spaceType: s.spaceType,
                      customTypeLabel: s.customTypeLabel,
                    })}
                  </span>
                </span>
                <span className="text-xs text-zinc-400">
                  {s.responsibilities.length > 0
                    ? `${s.responsibilities.length} responsibilit${s.responsibilities.length !== 1 ? "ies" : "y"}`
                    : "No responsibilities"}
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
  isUndesignated = false,
}: {
  space: SpaceView;
  parentUnit: UnitHierarchyNode | null;
  departments: { id: string; key: string; name: string }[];
  isUndesignated?: boolean;
}) {
  const copy = useBuilderCopy();
  const [showResps, setShowResps] = useState(false);
  const totalResps = space.responsibilities.length;

  return (
    <div className="space-y-4">
      {isUndesignated && <NotYetPlacedBanner />}

      {/* Header card */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="px-5 py-4">
          <h2 className="text-xl font-semibold text-zinc-900">
            {formatRoomDisplayName(space)}
          </h2>
          <div className="mt-1.5 flex items-center gap-3 text-sm text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <DoorOpen className="h-3.5 w-3.5" />
              {copy.editor.level3Badge}
            </span>
            <span>
              {parentUnit ? `in ${parentUnit.name}` : copy.labels.undesignated}
            </span>
            <span>
              {resolveSpaceTypeDisplayLabel({
                spaceType: space.spaceType,
                customTypeLabel: space.customTypeLabel,
              })}
            </span>
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
            {parentUnit && (
              <input type="hidden" name="unitId" value={parentUnit.id} />
            )}
            <label className="sm:col-span-2 flex flex-col gap-1 text-xs font-medium text-zinc-500">
              {copy.editor.level3NameLabel}
              <input
                name="name"
                defaultValue={space.name}
                required
                placeholder="e.g. Resident Room, Servery, Mechanical Room"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
              />
            </label>
            <div className="sm:col-span-2">
              <SpaceTypePresetFields
                defaultPresetKey={findPresetForStoredSpace({
                  spaceType: space.spaceType,
                  customTypeLabel: space.customTypeLabel,
                }).key}
                defaultCustomLabel={space.customTypeLabel ?? ""}
              />
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              {copy.editor.level3NumberLabel}
              <input
                name="roomNumber"
                defaultValue={space.roomNumber ?? ""}
                placeholder="e.g. 101, 32A, B-12"
                maxLength={32}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
              />
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

      {/* Room responsibility section */}
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
// Space responsibility editor (explicit room responsibilities)
// ---------------------------------------------------------------------------

function SpaceResponsibilityEditor({
  space,
  departments,
}: {
  space: SpaceView;
  parentUnit: UnitHierarchyNode | null;
  departments: { id: string; key: string; name: string }[];
}) {
  const copy = useBuilderCopy();
  const assignedDeptIds = new Set(space.responsibilities.map((r) => r.department.id));
  const available = departments.filter((d) => !assignedDeptIds.has(d.id));

  return (
    <div>
      <p className="text-xs text-zinc-500">{copy.editor.level3ResponsibilityHelp}</p>

      <ul className="mt-3 space-y-2">
        {space.responsibilities.map((row) => (
          <li key={row.department.id} className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm font-medium text-zinc-800">{row.department.name}</span>
                <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                  Direct
                </span>
              </div>
              <form action={deleteBuilderSpaceResponsibilityAction}>
                <input type="hidden" name="responsibilityId" value={row.id} />
                <button type="submit" className="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              </form>
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
                No capabilities selected for this department yet.
              </p>
            )}
          </li>
        ))}
        {space.responsibilities.length === 0 && (
          <li className="text-xs text-zinc-500">{ROOM_RESPONSIBILITY_EMPTY_MESSAGE}</li>
        )}
      </ul>

      <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
        {PLANT_FACILITY_WIDE_ACCESS_NOTE}
      </p>

      {available.length > 0 && (
        <AddSpaceResponsibilityForm
          spaceId={space.id}
          spaceType={space.spaceType}
          customTypeLabel={space.customTypeLabel}
          available={available}
        />
      )}
    </div>
  );
}

function AddSpaceResponsibilityForm({
  spaceId,
  spaceType,
  customTypeLabel,
  available,
}: {
  spaceId: string;
  spaceType: SpaceView["spaceType"];
  customTypeLabel: string | null;
  available: { id: string; key: string; name: string }[];
}) {
  const copy = useBuilderCopy();
  const spacePresetKey = findPresetForStoredSpace({
    spaceType,
    customTypeLabel,
  }).key;

  const [departmentId, setDepartmentId] = useState(available[0]?.id ?? "");
  const selectedDept = available.find((d) => d.id === departmentId) ?? available[0];
  const presets = listPresetsForDepartment(selectedDept?.key ?? "");

  const recommendedKey = recommendResponsibilityPresetKey(
    selectedDept?.key ?? "",
    spacePresetKey,
  );

  const [presetKey, setPresetKey] = useState<string>(recommendedKey ?? "");
  const [selectedCaps, setSelectedCaps] = useState<Set<string>>(() =>
    new Set(recommendedKey ? capabilitiesForPreset(recommendedKey) : []),
  );

  // When available departments change (e.g. after add), keep a valid selection.
  useEffect(() => {
    if (available.length === 0) return;
    if (available.some((d) => d.id === departmentId)) return;
    const next = available[0]!;
    setDepartmentId(next.id);
    const nextRecommended = recommendResponsibilityPresetKey(
      next.key,
      spacePresetKey,
    );
    setPresetKey(nextRecommended ?? "");
    setSelectedCaps(
      new Set(nextRecommended ? capabilitiesForPreset(nextRecommended) : []),
    );
  }, [available, departmentId, spacePresetKey]);

  // Department change → re-recommend preset + apply its capabilities.
  function handleDepartmentChange(nextId: string) {
    setDepartmentId(nextId);
    const dept = available.find((d) => d.id === nextId);
    const nextRecommended = recommendResponsibilityPresetKey(
      dept?.key ?? "",
      spacePresetKey,
    );
    setPresetKey(nextRecommended ?? "");
    setSelectedCaps(
      new Set(nextRecommended ? capabilitiesForPreset(nextRecommended) : []),
    );
  }

  // Preset change → replace checkbox selection (admin can still edit after).
  function handlePresetChange(nextKey: string) {
    setPresetKey(nextKey);
    setSelectedCaps(new Set(capabilitiesForPreset(nextKey)));
  }

  function toggleCapability(key: string) {
    setSelectedCaps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const hasPresets = presets.length > 0;

  return (
    <form
      action={upsertBuilderSpaceResponsibilityAction}
      className="mt-4 space-y-3 rounded-lg border border-dashed border-zinc-300 p-3"
      data-testid="add-space-responsibility-form"
    >
      <input type="hidden" name="spaceId" value={spaceId} />
      <p className="text-xs font-medium text-zinc-600">{copy.editor.addLevel3Responsibility}</p>

      <label className="flex flex-col gap-1 text-[11px] font-medium text-zinc-500">
        Department
        <select
          name="departmentId"
          required
          value={departmentId}
          onChange={(e) => handleDepartmentChange(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900"
          data-testid="responsibility-department"
        >
          {available.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </label>

      {hasPresets && (
        <label className="flex flex-col gap-1 text-[11px] font-medium text-zinc-500">
          Responsibility template
          <select
            value={presetKey}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900"
            data-testid="responsibility-preset"
          >
            {presets.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
                {p.key === recommendedKey ? " (suggested)" : ""}
              </option>
            ))}
          </select>
          {presets.find((p) => p.key === presetKey)?.description ? (
            <span className="font-normal text-zinc-400">
              {presets.find((p) => p.key === presetKey)!.description}
            </span>
          ) : null}
        </label>
      )}

      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {CAPABILITY_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-1.5 text-xs text-zinc-700">
            <input
              type="checkbox"
              name="capabilities"
              value={key}
              checked={selectedCaps.has(key)}
              onChange={() => toggleCapability(key)}
            />
            {CAPABILITY_LABELS[key]}
          </label>
        ))}
      </div>
      <p className="text-[10px] text-zinc-400">
        Templates only preselect capabilities — edit checkboxes freely before saving.
        Nothing about the template is stored.
      </p>
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
// Create forms
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Create forms
// ---------------------------------------------------------------------------

function CreateFloorForm({
  onDone,
}: {
  onDone: () => void;
}) {
  const copy = useBuilderCopy();
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
        {copy.forms.level1NameLabel}
        <input
          name="name"
          required
          placeholder={copy.forms.level1NamePlaceholder}
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
          {copy.forms.createLevel1}
        </button>
      </div>
    </form>
  );
}

function CreateNeighborhoodForm({
  parentId,
  onDone,
}: {
  parentId: string | null;
  onDone: () => void;
}) {
  const copy = useBuilderCopy();
  return (
    <form
      action={async (formData) => {
        await createBuilderNeighborhoodAction(formData);
        onDone();
      }}
      className="grid gap-3"
      data-testid="create-neighborhood-form"
    >
      <input type="hidden" name="hierarchyIntent" value="neighborhood" />
      {parentId && (
        <input type="hidden" name="parentUnitId" value={parentId} />
      )}
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        {copy.forms.level2NameLabel}
        <input
          name="name"
          required
          placeholder={copy.forms.level2NamePlaceholder}
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
          data-testid="create-neighborhood-submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          {copy.forms.createLevel2}
        </button>
      </div>
    </form>
  );
}

function SpaceTypePresetFields({
  defaultPresetKey = "patient_room",
  defaultCustomLabel = "",
}: {
  defaultPresetKey?: string;
  defaultCustomLabel?: string;
}) {
  const [presetKey, setPresetKey] = useState(defaultPresetKey);
  const isCustom = presetKey === CUSTOM_SPACE_PRESET_KEY;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 sm:col-span-2">
        Space type
        <select
          name="spaceTypePreset"
          value={presetKey}
          onChange={(e) => setPresetKey(e.target.value)}
          data-testid="space-type-preset"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        >
          {SPACE_TYPE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      </label>
      {isCustom && (
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 sm:col-span-2">
          Custom type label
          <input
            name="customTypeLabel"
            required
            defaultValue={defaultCustomLabel}
            placeholder="e.g. Soil Hold, Family Lounge, Loading Dock"
            maxLength={80}
            data-testid="custom-type-label"
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
          />
        </label>
      )}
    </div>
  );
}

function CreateSpaceForm({
  unitId,
  onDone,
}: {
  unitId: string | null;
  onDone: () => void;
}) {
  const copy = useBuilderCopy();
  return (
    <form
      action={async (formData) => {
        await createBuilderSpaceAction(formData);
        onDone();
      }}
      className="grid gap-3"
      data-testid="create-space-form"
    >
      {unitId && (
        <input type="hidden" name="unitId" value={unitId} />
      )}
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        {copy.forms.level3NameLabel}
        <input
          name="name"
          required
          placeholder={copy.forms.level3NamePlaceholder}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
      </label>
      <SpaceTypePresetFields />
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        {copy.forms.level3NumberLabel}
        <input
          name="roomNumber"
          placeholder="Optional, e.g. 101, 32A, B-12"
          maxLength={32}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
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
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          {copy.forms.createLevel3}
        </button>
      </div>
    </form>
  );
}

function BulkCreateSpacesForm({
  unitId,
  onDone,
}: {
  unitId: string;
  onDone: () => void;
}) {
  const copy = useBuilderCopy();
  const [result, setResult] = useState<{
    created: number;
    skippedExisting: string[];
    skippedDuplicateInBatch: string[];
    errors: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        setError(null);
        setResult(null);
        try {
          const outcome = await createBuilderSpacesBulkAction(formData);
          setResult(outcome);
          if (
            outcome.created > 0 &&
            outcome.skippedExisting.length === 0 &&
            outcome.errors.length === 0
          ) {
            onDone();
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Bulk create failed.");
        }
      }}
      className="grid gap-3"
    >
      <input type="hidden" name="unitId" value={unitId} />
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        {copy.forms.bulkNamesLabel}
        <textarea
          name="namesText"
          required
          rows={12}
          placeholder={"Patient Room 32A\nPatient Room 33A\nSoil Hold\nClean Hold\n\nOr a range:\nPatient Room 32A–40A"}
          className="rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
      </label>
      <p className="text-xs text-zinc-500">
        {copy.forms.bulkMaxHint(BULK_ROOM_MAX)}
      </p>
      <SpaceTypePresetFields defaultPresetKey="patient_room" />
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Description (optional, applied to all)
        <input
          name="descriptionPrefix"
          placeholder="Optional shared description"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
      </label>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {result && (
        <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700 space-y-1">
          <p>{copy.forms.bulkCreated(result.created)}</p>
          {result.skippedExisting.length > 0 && (
            <p className="text-amber-700">
              Skipped existing: {result.skippedExisting.join(", ")}
            </p>
          )}
          {result.skippedDuplicateInBatch.length > 0 && (
            <p className="text-amber-700">
              Duplicate lines skipped: {result.skippedDuplicateInBatch.join(", ")}
            </p>
          )}
          {result.errors.map((e) => (
            <p key={e} className="text-red-700">{e}</p>
          ))}
        </div>
      )}

      <button
        type="submit"
        data-testid="bulk-create-rooms-submit"
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
      >
        {copy.forms.bulkSubmit}
      </button>
    </form>
  );
}

function MoveUnitToFloorForm({
  unitId,
  unitName,
  currentParentId,
  floors,
  allowUndesignated = false,
  onDone,
}: {
  unitId: string;
  unitName: string;
  currentParentId: string | null;
  floors: { id: string; name: string }[];
  allowUndesignated?: boolean;
  onDone: () => void;
}) {
  const copy = useBuilderCopy();
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  void currentParentId;

  if (floors.length === 0 && !allowUndesignated) {
    return (
      <p className="text-sm text-zinc-600">
        {copy.forms.noOtherLevel1(unitName)}
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const raw = String(fd.get("newParentUnitId") || "");
        if (!raw) return;
        const newParentUnitId = raw === UNDESIGNATED_DROP_ID ? null : raw;
        setError(null);
        startTransition(async () => {
          try {
            await moveBuilderUnitAction({
              unitId,
              newParentUnitId,
              newDisplayOrder: 100,
            });
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Move failed.");
          }
        });
      }}
      className="grid gap-3"
    >
      <p className="text-sm text-zinc-600">
        Move <span className="font-medium text-zinc-900">{unitName}</span>{" "}
        {copy.forms.moveUnitIntro(allowUndesignated)}
      </p>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Destination
        <select
          name="newParentUnitId"
          required
          defaultValue=""
          data-testid="move-to-floor-select"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        >
          <option value="" disabled>
            Select a destination…
          </option>
          {allowUndesignated && (
            <option value={UNDESIGNATED_DROP_ID}>{copy.labels.undesignated}</option>
          )}
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <button
        type="submit"
        data-testid="move-to-floor-submit"
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
      >
        Move
      </button>
    </form>
  );
}

function MoveSpaceToNeighborhoodForm({
  spaceId,
  spaceName,
  currentUnitId,
  destinations,
  onDone,
}: {
  spaceId: string;
  spaceName: string;
  currentUnitId: string | null;
  destinations: { id: string; name: string; groupLabel?: string; kind?: string }[];
  onDone: () => void;
}) {
  const copy = useBuilderCopy();
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  void currentUnitId;

  if (destinations.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        No destinations available for &quot;{spaceName}&quot;.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const raw = String(fd.get("newUnitId") || "");
        if (!raw) return;
        const newUnitId = raw === UNDESIGNATED_DROP_ID ? null : raw;
        setError(null);
        startTransition(async () => {
          try {
            await moveBuilderSpaceAction({
              spaceId,
              newUnitId,
              newSortOrder: 100,
            });
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Move failed.");
          }
        });
      }}
      className="grid gap-3"
    >
      <p className="text-sm text-zinc-600">
        Move <span className="font-medium text-zinc-900">{spaceName}</span>{" "}
        {copy.forms.moveSpaceIntro}
      </p>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Destination
        <select
          name="newUnitId"
          required
          defaultValue=""
          data-testid="move-to-neighborhood-select"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        >
          <option value="" disabled>
            Select a destination…
          </option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.groupLabel ? `${d.groupLabel} / ${d.name}` : d.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <button
        type="submit"
        data-testid="move-to-neighborhood-submit"
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
      >
        Move
      </button>
    </form>
  );
}

function HighlightedText({
  text,
  query,
  selected,
}: {
  text: string;
  query: string;
  selected?: boolean;
}) {
  const parts = splitHighlightParts(text, query);
  if (!query.trim() || parts.every((p) => !p.match)) {
    return <>{text}</>;
  }
  return (
    <>
      {parts.map((part, i) =>
        part.match ? (
          <mark
            key={`${i}-${part.text}`}
            className={
              selected
                ? "rounded-sm bg-amber-300/40 text-inherit"
                : "rounded-sm bg-amber-100 text-inherit"
            }
          >
            {part.text}
          </mark>
        ) : (
          <span key={`${i}-${part.text}`}>{part.text}</span>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filterUndesignatedSpaces(spaces: SpaceView[], query: string): SpaceView[] {
  const trimmed = query.trim();
  if (!trimmed) return spaces;
  const q = trimmed.toLowerCase();
  return spaces.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      (s.roomNumber?.toLowerCase().includes(q) ?? false) ||
      (s.code?.toLowerCase().includes(q) ?? false),
  );
}

function findUnitInHierarchy(
  hierarchy: FacilityHierarchy,
  id: string,
): UnitHierarchyNode | null {
  return findUnit(hierarchy.units, id) ?? findUnit(hierarchy.stagedUnits, id);
}

function findSpaceInHierarchy(
  hierarchy: FacilityHierarchy,
  spaceId: string,
): SpaceView | null {
  const undesignated = hierarchy.undesignatedSpaces.find((s) => s.id === spaceId);
  if (undesignated) return undesignated;
  return findSpace(hierarchy.units, spaceId) ?? findSpace(hierarchy.stagedUnits, spaceId);
}

function findSpaceWithParentInHierarchy(
  hierarchy: FacilityHierarchy,
  spaceId: string,
): { space: SpaceView; parentUnitId: string | null } | null {
  const undesignated = hierarchy.undesignatedSpaces.find((s) => s.id === spaceId);
  if (undesignated) return { space: undesignated, parentUnitId: null };

  const inUnits = findSpaceWithParent(hierarchy.units, spaceId);
  if (inUnits) return inUnits;

  return findSpaceWithParent(hierarchy.stagedUnits, spaceId);
}

function getSiblingUnits(
  units: UnitHierarchyNode[],
  parentUnitId: string | null,
): UnitHierarchyNode[] {
  if (parentUnitId == null) return units;
  const parent = findUnit(units, parentUnitId);
  return parent?.childUnits ?? [];
}

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
): { space: SpaceView; parentUnitId: string | null } | null {
  for (const u of units) {
    const s = u.childSpaces.find((s) => s.id === spaceId);
    if (s) return { space: s, parentUnitId: u.id };
    const found = findSpaceWithParent(u.childUnits, spaceId);
    if (found) return found;
  }
  return null;
}

function flattenUnits(
  ...unitTrees: UnitHierarchyNode[][]
): { id: string; name: string; parentUnitId: string | null }[] {
  const result: { id: string; name: string; parentUnitId: string | null }[] = [];
  function walk(nodes: UnitHierarchyNode[]) {
    for (const u of nodes) {
      result.push({ id: u.id, name: u.name, parentUnitId: u.parentUnitId });
      walk(u.childUnits);
    }
  }
  for (const tree of unitTrees) {
    walk(tree);
  }
  return result;
}

function countSpaces(unit: UnitHierarchyNode): number {
  let count = unit.childSpaces.length;
  for (const child of unit.childUnits) {
    count += countSpaces(child);
  }
  return count;
}

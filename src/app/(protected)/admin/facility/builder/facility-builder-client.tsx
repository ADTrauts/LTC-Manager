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
import { UnitType } from "@prisma/client";
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
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  Upload,
} from "lucide-react";

import { Button } from "@/components/design-system/Button";
import { Drawer } from "@/components/drawer";
import type {
  FacilityHierarchy,
  FacilityRoomTypeView,
  UnitHierarchyNode,
  SpaceView,
} from "@/lib/facility-builder/load-facility-hierarchy";
import {
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
import { resolveSpaceTypeDisplayLabel } from "@/lib/facility-builder/space-type-presets";
import { unitTypeLabel } from "@/lib/unit-type-config";
import {
  buildBuilderCopy,
  DEFAULT_BUILDER_COPY,
  type BuilderCopy,
} from "@/lib/facility-builder/facility-vocabulary";
import { locationTreePaddingLeft } from "@/components/location-tree/location-tree-tokens";
import {
  createBuilderFloorAction,
  createBuilderNeighborhoodAction,
  updateBuilderUnitAction,
  deleteBuilderUnitAction,
  createBuilderSpaceAction,
  createBuilderSpacesBulkAction,
  updateBuilderSpaceAction,
  deleteBuilderSpaceAction,
  moveBuilderUnitAction,
  moveBuilderSpaceAction,
  reorderBuilderUnitsAction,
  reorderBuilderSpacesAction,
  renameBuilderUnitAction,
  renameBuilderSpaceAction,
  toggleBuilderUnitActiveAction,
  convertBuilderLegacyToFloorAction,
} from "./actions";
import {
  DepartmentResponsibilityCheckboxes,
  FloorBulkDepartmentApply,
} from "./department-responsibility-checkboxes";
import { FacilityBulkImportPanel } from "./facility-bulk-import-panel";
import { useFacilityBuilderCompact } from "./use-facility-builder-compact";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNIT_TYPE_OPTIONS: UnitType[] = [
  "OTHER", "SERVERY", "KITCHEN", "RETAIL", "OFFICE", "STORAGE",
  "RESIDENT_AREA", "COMMON_AREA", "MECHANICAL", "RESTROOM_CLUSTER",
  "EVS_ZONE", "GROUND",
];

/** Facility vocabulary copy — provided once at the builder root; consumed everywhere. */
const BuilderCopyContext = createContext<BuilderCopy>(DEFAULT_BUILDER_COPY);

function useBuilderCopy(): BuilderCopy {
  return useContext(BuilderCopyContext);
}

const FacilityRoomTypesContext = createContext<FacilityRoomTypeView[]>([]);

function useFacilityRoomTypes(): FacilityRoomTypeView[] {
  return useContext(FacilityRoomTypesContext);
}

function activeRoomTypes(roomTypes: FacilityRoomTypeView[]): FacilityRoomTypeView[] {
  return roomTypes.filter((row) => row.isActive);
}

function defaultFacilityRoomTypeId(roomTypes: FacilityRoomTypeView[]): string {
  const active = activeRoomTypes(roomTypes);
  const preferred = active.find((row) =>
    /patient|resident|guest/i.test(row.displayName),
  );
  return preferred?.id ?? active[0]?.id ?? "";
}

function roomTypeDisplayLabel(
  space: Pick<SpaceView, "facilityRoomTypeId" | "spaceType" | "customTypeLabel">,
  roomTypes: FacilityRoomTypeView[],
): string {
  if (space.facilityRoomTypeId) {
    const match = roomTypes.find((row) => row.id === space.facilityRoomTypeId);
    if (match) return match.displayName;
  }
  return resolveSpaceTypeDisplayLabel({
    spaceType: space.spaceType,
    customTypeLabel: space.customTypeLabel,
  });
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

export function FacilityBuilderClient({
  hierarchy,
  canonicalLogsEnabled = false,
}: {
  hierarchy: FacilityHierarchy;
  canonicalLogsEnabled?: boolean;
}) {
  const router = useRouter();
  const copy = useMemo(
    () => buildBuilderCopy(hierarchy.vocabulary),
    [hierarchy.vocabulary],
  );
  const [selection, setSelection] = useState<Selection>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
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
  const [compactDetailOpen, setCompactDetailOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isCompact = useFacilityBuilderCompact();

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
  const undesignatedCount = hierarchy.stagedUnits.length + hierarchy.undesignatedSpaces.length;
  /** Staging zone: show when it has items, while searching matches, or during an active drag. */
  const showUndesignatedSection =
    undesignatedCount > 0 ||
    Boolean(activeDragId) ||
    (isSearching &&
      (displayStagedUnits.length > 0 || displayUndesignatedSpaces.length > 0));

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
  const grandparentOfSpace =
    parentUnitOfSpace?.parentUnitId != null
      ? findUnitInHierarchy(hierarchy, parentUnitOfSpace.parentUnitId)
      : null;

  const allFlatUnits = flattenUnits(hierarchy.units, hierarchy.stagedUnits);

  function selectPlace(next: Selection) {
    setSelection(next);
    if (isCompact && next) setCompactDetailOpen(true);
  }

  useEffect(() => {
    if (isCompact && selection) setCompactDetailOpen(true);
    // Open detail when entering compact with an existing selection (e.g. resize).
    // Intentionally omits `selection` so closing the drawer does not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selection open is handled by selectPlace
  }, [isCompact]);

  const placeDetailTitle = selectedUnit
    ? selectedUnit.name
    : selectedSpace
      ? formatRoomDisplayName(selectedSpace)
      : "Place details";

  const createSpaceParentName = createSpaceDrawer?.unitId
    ? findUnitInHierarchy(hierarchy, createSpaceDrawer.unitId)?.name
    : null;
  const createNeighborhoodParentName = createUnitDrawer?.parentId
    ? findUnitInHierarchy(hierarchy, createUnitDrawer.parentId)?.name
    : null;

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
  const isEmptyFacility =
    hierarchy.units.length === 0 &&
    hierarchy.stagedUnits.length === 0 &&
    hierarchy.undesignatedSpaces.length === 0;

  const structureSummary = (() => {
    let floors = 0;
    let neighborhoods = 0;
    let rooms = hierarchy.undesignatedSpaces.length;
    function walk(nodes: UnitHierarchyNode[]) {
      for (const u of nodes) {
        const kind = resolveBuilderNodeDisplayKind(u);
        if (kind === "floor") floors += 1;
        else if (kind === "neighborhood" || kind === "legacy_location") neighborhoods += 1;
        rooms += u.childSpaces.length;
        walk(u.childUnits);
      }
    }
    walk(hierarchy.units);
    walk(hierarchy.stagedUnits);
    return { floors, neighborhoods, rooms };
  })();

  function openAddFloor() {
    setCreateUnitDrawer({ parentId: null, depth: 0, intent: "floor" });
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

  const editorPanel = (
    <>
      {!selection && (
        <div
          className="px-1 py-2 sm:px-2"
          data-testid="facility-editor-empty"
          data-empty-kind={isEmptyFacility ? "no-locations" : "nothing-selected"}
        >
          {isEmptyFacility ? (
            <div className="max-w-md py-6 text-center sm:py-10">
              <Building2 className="mx-auto h-8 w-8 text-zinc-300" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold text-zinc-900">
                Build your facility structure
              </h3>
              <p className="mt-2 text-sm text-zinc-600">
                Start by adding the first {copy.labels.level1.toLowerCase()}.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  data-testid="add-floor-editor-empty"
                  onClick={openAddFloor}
                  icon={<Plus className="h-4 w-4" />}
                >
                  {copy.tree.emptyAction}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  data-testid="facility-bulk-import-empty-editor"
                  onClick={() => setShowBulkImport(true)}
                  icon={<Upload className="h-4 w-4" />}
                >
                  Bulk import
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-w-lg py-4 sm:py-8" data-testid="facility-editor-orientation">
              <h3 className="text-xl font-semibold tracking-tight text-zinc-900">
                {hierarchy.facilityName}
              </h3>
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div>
                  <dt className="text-zinc-500">{copy.labels.level1Plural}</dt>
                  <dd className="text-lg font-semibold tabular-nums text-zinc-900">
                    {structureSummary.floors}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">{copy.labels.level2Plural}</dt>
                  <dd className="text-lg font-semibold tabular-nums text-zinc-900">
                    {structureSummary.neighborhoods}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">{copy.labels.level3Plural}</dt>
                  <dd className="text-lg font-semibold tabular-nums text-zinc-900">
                    {structureSummary.rooms}
                  </dd>
                </div>
              </dl>
              <p className="mt-5 text-sm text-zinc-600">{copy.tree.selectPrompt}</p>
              <p className="mt-2 text-xs text-zinc-500">
                Use the structure panel to add or reorganize locations.
              </p>
            </div>
          )}
        </div>
      )}

      {selectedUnit && (
        <UnitEditor
          unit={selectedUnit}
          displayKind={resolveBuilderNodeDisplayKind(selectedUnit)}
          allUnits={allFlatUnits}
          parentFloorName={
            selectedUnit.parentUnitId
              ? findUnitInHierarchy(hierarchy, selectedUnit.parentUnitId)?.name ?? null
              : null
          }
          departments={hierarchy.departments}
          canonicalLogsEnabled={canonicalLogsEnabled}
          onCreateSpace={(unitId) => setCreateSpaceDrawer({ unitId })}
          onBulkCreateSpace={(unitId) => setBulkSpaceDrawer({ unitId })}
          onCreateNeighborhood={(unitId) =>
            setCreateUnitDrawer({ parentId: unitId, depth: 1, intent: "neighborhood" })
          }
          onSelectSpace={(spaceId, unitId) => selectPlace({ type: "space", spaceId, unitId })}
          onSelectUnit={(unitId) => selectPlace({ type: "unit", unitId })}
        />
      )}

      {selectedSpace && (
        <SpaceEditor
          space={selectedSpace}
          parentUnit={parentUnitOfSpace}
          parentFloorName={grandparentOfSpace?.name ?? null}
          departments={hierarchy.departments}
          isUndesignated={selection?.type === "space" && !selection.unitId}
          canonicalLogsEnabled={canonicalLogsEnabled}
        />
      )}
    </>
  );

  return (
    <BuilderCopyContext.Provider value={copy}>
    <FacilityRoomTypesContext.Provider value={hierarchy.roomTypes}>
    {showBulkImport ? (
      <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4" data-testid="facility-bulk-import-panel">
        <FacilityBulkImportPanel
          onClose={() => setShowBulkImport(false)}
          onImported={() => {
            router.refresh();
          }}
        />
      </div>
    ) : null}
    <DndContext
      id="facility-builder"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex flex-col items-stretch gap-0 overflow-hidden rounded-lg border border-zinc-200 bg-white xl:flex-row xl:min-h-[min(70vh,52rem)]"
        data-testid="facility-builder"
      >
        {/* Hierarchy pane */}
        <div
          className="flex w-full shrink-0 flex-col border-zinc-200 xl:w-80 xl:border-r"
          data-testid="facility-hierarchy-pane"
        >
          <div className="border-b border-zinc-100 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Structure</h2>
                {!isEmptyFacility ? (
                  <p className="mt-0.5 text-[11px] tabular-nums text-zinc-500">
                    {structureSummary.floors} {copy.labels.level1Plural}
                    {" · "}
                    {structureSummary.neighborhoods} {copy.labels.level2Plural}
                    {" · "}
                    {structureSummary.rooms} {copy.labels.level3Plural}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-2 border-b border-zinc-100 px-3 py-2.5">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={copy.toolbar.searchPlaceholder}
                data-testid="hierarchy-search"
                className="w-full rounded-md border border-zinc-200 bg-zinc-50/80 py-2 pl-8 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {hasAnyUnits ? (
                <Button
                  type="button"
                  size="compact"
                  data-testid="add-floor-root"
                  onClick={openAddFloor}
                  icon={<Plus className="h-3.5 w-3.5" />}
                  className="flex-1"
                >
                  {copy.tree.emptyAction}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                size="compact"
                data-testid="facility-bulk-import-open"
                onClick={() => setShowBulkImport(true)}
                icon={<Upload className="h-3.5 w-3.5" />}
                className={hasAnyUnits ? "flex-1" : "w-full"}
              >
                Bulk import
              </Button>
            </div>
          </div>

          {isCompact && !selection && !isEmptyFacility ? (
            <div className="border-b border-zinc-100 px-4 py-2.5 text-xs text-zinc-600">
              Select a place to open its details.
            </div>
          ) : null}

          <div className="max-h-[min(62vh,40rem)] flex-1 overflow-y-auto px-1 py-1.5 xl:max-h-none">
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
                quietEmpty={!undesignatedCount && Boolean(activeDragId)}
                onToggle={toggleExpand}
                onSelect={selectPlace}
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
              <div className="px-4 py-6 text-center" data-testid="facility-tree-empty">
                <p className="text-sm font-medium text-zinc-700">{copy.tree.emptyTitle}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  {isEmptyFacility
                    ? `Start by adding your first ${copy.labels.level1.toLowerCase()}.`
                    : copy.tree.emptyBody}
                </p>
                <div className="mt-4 flex flex-col items-stretch gap-2">
                  <Button
                    type="button"
                    data-testid="add-floor-empty"
                    onClick={openAddFloor}
                    icon={<Plus className="h-4 w-4" />}
                  >
                    {copy.tree.emptyAction}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="facility-bulk-import-empty"
                    onClick={() => setShowBulkImport(true)}
                    icon={<Upload className="h-4 w-4" />}
                  >
                    Import facility structure
                  </Button>
                </div>
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
                  <p className="mx-2 mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
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
                        onSelect={selectPlace}
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

        {/* Desktop editor */}
        {!isCompact ? (
          <div
            className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
            data-testid="facility-place-editor"
          >
            <div className="mx-auto w-full max-w-3xl">{editorPanel}</div>
          </div>
        ) : null}

        {/* Tablet / compact place detail */}
        {isCompact ? (
          <Drawer
            open={compactDetailOpen && Boolean(selection)}
            onClose={() => setCompactDetailOpen(false)}
            title={placeDetailTitle}
            closeLabel="Back to structure"
            size="lg"
            data-testid="facility-place-detail-drawer"
          >
            <div className="pb-6">{editorPanel}</div>
          </Drawer>
        ) : null}

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
                : createNeighborhoodParentName
                  ? `Add ${copy.labels.level2} to ${createNeighborhoodParentName}`
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
            title={
              createSpaceParentName
                ? `Add ${copy.labels.level3} to ${createSpaceParentName}`
                : copy.drawers.addLevel3
            }
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
    </FacilityRoomTypesContext.Provider>
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
  quietEmpty = false,
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
  quietEmpty?: boolean;
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
      className={`mb-2 rounded-md px-1 py-1.5 transition-colors ${
        isOver
          ? "border border-amber-300 bg-amber-50/60"
          : hasItems
            ? "border border-zinc-200 bg-zinc-50/50"
            : quietEmpty
              ? "border border-dashed border-amber-200 bg-amber-50/40"
              : "border border-transparent"
      }`}
    >
      {undesignatedCount > 0 && (
        <div className="mx-1 mb-2 rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-900">
            {copy.undesignatedSection.warningTitle}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800/90">
            {copy.undesignatedSection.warningBody}
          </p>
        </div>
      )}

      {!hasItems && quietEmpty && (
        <p className="px-2 py-1.5 text-[11px] text-zinc-500">
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
    <li ref={setNodeRef} style={style} data-display-kind={displayKind} className="group/unit">
      <div
        className={`group flex items-center rounded-md cursor-pointer transition-colors ${
          isSelected
            ? "border-l-2 border-l-amber-700 bg-amber-50 text-amber-950"
            : displayKind === "floor"
              ? "border-l-2 border-l-transparent text-zinc-900 hover:bg-zinc-50 font-medium"
              : "border-l-2 border-l-transparent text-zinc-800 hover:bg-zinc-50"
        } ${displayKind === "floor" && !isSelected ? "mt-1" : ""}`}
        style={{ paddingLeft: `${locationTreePaddingLeft(depth)}px` }}
        aria-selected={isSelected}
      >
        <button
          type="button"
          className={`shrink-0 p-1 cursor-grab opacity-0 group-hover:opacity-60 transition-opacity ${
            isSelected ? "text-amber-700/70" : "text-zinc-300"
          } ${!dndEnabled ? "invisible" : ""}`}
          {...(dndEnabled ? { ...attributes, ...listeners } : {})}
          aria-label={`Drag ${unit.name}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(unit.id); }}
          className={`shrink-0 p-0.5 transition-transform ${
            canExpand ? "" : "invisible"
          } ${isSelected ? "text-amber-800/70" : "text-zinc-400"}`}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? `Collapse ${unit.name}` : `Expand ${unit.name}`}
        >
          {isExpanded
            ? <ChevronDown className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />}
        </button>

        <span className={`shrink-0 mr-2 ${isSelected ? "text-amber-800/80" : "text-zinc-400"}`}>
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
            <span className={`text-sm ${displayKind === "floor" ? "font-semibold" : displayKind === "neighborhood" ? "font-medium" : "font-medium"} ${!unit.isActive ? "opacity-40 line-through" : ""}`}>
              <HighlightedText text={unit.name} query={searchQuery} selected={isSelected} />
            </span>
          )}
        </button>

        {!isRenaming && displayKind === "legacy_location" && (
          <span
            className={`shrink-0 mr-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              isSelected ? "bg-amber-100 text-amber-900" : "bg-amber-50 text-amber-700"
            }`}
            title={copy.tree.unassignedTitle}
          >
            {copy.tree.unassignedBadge}
          </span>
        )}

        {!isRenaming && displayKind === "staged" && (
          <span
            className={`shrink-0 mr-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              isSelected ? "bg-amber-100 text-amber-900" : "bg-amber-50 text-amber-700"
            }`}
            title={copy.tree.stagedTitle}
          >
            {copy.tree.stagedBadge}
          </span>
        )}

        {!isRenaming && displayKind === "floor" && unit.childUnits.length > 0 && (
          <span
            className={`shrink-0 mr-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
              isSelected ? "bg-amber-100 text-amber-900" : "bg-zinc-100 text-zinc-500"
            }`}
            title={`${unit.childUnits.length} ${copy.labels.level2Plural.toLowerCase()}`}
          >
            {unit.childUnits.length}
          </span>
        )}
        {!isRenaming && displayKind !== "floor" && totalRooms > 0 && (
          <span
            className={`shrink-0 mr-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
              isSelected ? "bg-amber-100 text-amber-900" : "bg-zinc-100 text-zinc-500"
            }`}
            title={`${totalRooms} ${copy.labels.level3Plural.toLowerCase()}`}
          >
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
            className={`shrink-0 rounded p-1 transition-opacity builder-essential-touch-visible min-h-10 min-w-10 ${
              isSelected
                ? "builder-essential-selected text-amber-800/70 hover:text-amber-950"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
            aria-label={`More actions for ${unit.name}`}
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
                className={`builder-essential-touch-visible flex flex-wrap items-center gap-1 py-0.5 transition-opacity ${
                  isSelected ? "builder-essential-selected" : ""
                }`}
                style={{ paddingLeft: `${(depth + 1) * 16 + 28}px` }}
              >
                {showAddNeighborhood && (
                  <button
                    type="button"
                    data-testid={`add-neighborhood-${unit.id}`}
                    onClick={() => onCreateUnit(unit.id, depth + 1)}
                    className="flex min-h-10 items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800 transition-colors"
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
                      className="flex min-h-10 items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      {copy.labels.level3}
                    </button>
                    <button
                      type="button"
                      data-testid={`add-rooms-bulk-${unit.id}`}
                      onClick={() => onBulkCreateSpace(unit.id)}
                      className="flex min-h-10 items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800 transition-colors"
                    >
                      <ListPlus className="h-3 w-3" />
                      Bulk add
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
        className={`group flex items-center rounded-md cursor-pointer transition-colors ${
          isSelected
            ? "border-l-2 border-l-amber-700 bg-amber-50 text-amber-950"
            : "border-l-2 border-l-transparent text-zinc-700 hover:bg-zinc-50"
        }`}
        style={{ paddingLeft: `${locationTreePaddingLeft(depth)}px` }}
        aria-selected={isSelected}
      >
        <button
          type="button"
          className={`shrink-0 p-1 cursor-grab opacity-0 group-hover:opacity-60 transition-opacity ${
            isSelected ? "text-amber-700/70" : "text-zinc-300"
          } ${!dndEnabled ? "invisible" : ""}`}
          {...(dndEnabled ? { ...attributes, ...listeners } : {})}
          aria-label={`Drag ${formatRoomDisplayName(space)}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <span className="shrink-0 w-5" />

        <span className={`shrink-0 mr-2 ${isSelected ? "text-amber-800/80" : "text-zinc-400"}`}>
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
            className={`shrink-0 rounded p-1 transition-opacity builder-essential-touch-visible min-h-10 min-w-10 ${
              isSelected
                ? "builder-essential-selected text-amber-800/70 hover:text-amber-950"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
            aria-label={`More actions for ${formatRoomDisplayName(space)}`}
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
  parentFloorName,
  departments,
  canonicalLogsEnabled = false,
  onCreateSpace,
  onBulkCreateSpace,
  onCreateNeighborhood,
  onSelectSpace,
  onSelectUnit,
}: {
  unit: UnitHierarchyNode;
  displayKind: BuilderNodeDisplayKind;
  allUnits: { id: string; name: string; parentUnitId: string | null }[];
  parentFloorName: string | null;
  departments: { id: string; key: string; name: string }[];
  canonicalLogsEnabled?: boolean;
  onCreateSpace: (unitId: string) => void;
  onBulkCreateSpace: (unitId: string) => void;
  onCreateNeighborhood: (unitId: string) => void;
  onSelectSpace: (spaceId: string, unitId: string) => void;
  onSelectUnit: (unitId: string) => void;
}) {
  const copy = useBuilderCopy();
  const roomTypes = useFacilityRoomTypes();
  const label = displayKindLabel(displayKind, copy);
  const totalRooms = countSpaces(unit);
  void allUnits;
  const KindIcon =
    displayKind === "floor"
      ? Building2
      : displayKind === "neighborhood"
        ? LayoutGrid
        : displayKind === "staged"
          ? MapPin
          : MapPin;

  const summaryParts: string[] = [];
  if (displayKind === "floor") {
    if (unit.childUnits.length > 0) summaryParts.push(copy.editor.level2Count(unit.childUnits.length));
    if (totalRooms > 0) summaryParts.push(copy.editor.level3Count(totalRooms));
  } else if (displayKind === "neighborhood") {
    if (parentFloorName) summaryParts.push(parentFloorName);
    summaryParts.push(copy.editor.level3Count(unit.childSpaces.length));
  }

  return (
    <div className="space-y-6" data-testid="facility-unit-editor">
      {displayKind === "staged" && <NotYetPlacedBanner />}

      <header className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">{unit.name}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600">
              <span className="inline-flex items-center gap-1 font-medium text-zinc-800">
                <KindIcon className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
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
              {!unit.isActive && (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-500">
                  Inactive
                </span>
              )}
            </p>
            {summaryParts.length > 0 ? (
              <p className="mt-1 text-sm text-zinc-500">{summaryParts.join(" · ")}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {canAddNeighborhood(displayKind) && (
              <Button
                type="button"
                variant="secondary"
                size="compact"
                onClick={() => onCreateNeighborhood(unit.id)}
                icon={<Plus className="h-3.5 w-3.5" />}
              >
                {`Add ${copy.labels.level2.toLowerCase()} to ${unit.name}`}
              </Button>
            )}
            {canAddRoom(displayKind) && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  onClick={() => onCreateSpace(unit.id)}
                  icon={<Plus className="h-3.5 w-3.5" />}
                >
                  {`Add ${copy.labels.level3.toLowerCase()} to ${unit.name}`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="compact"
                  data-testid="add-multiple-rooms-editor"
                  onClick={() => onBulkCreateSpace(unit.id)}
                  icon={<ListPlus className="h-3.5 w-3.5" />}
                >
                  Bulk add {copy.labels.level3Plural.toLowerCase()}
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {canonicalLogsEnabled && displayKind !== "floor" ? (
        <section className="max-w-xl space-y-1" data-testid="facility-unit-logs-link">
          <h3 className="text-sm font-semibold text-zinc-900">Logs</h3>
          <p className="text-xs text-zinc-500">Attach Catalog Logs to this unit.</p>
          <Link
            href={`/build/logs/targets/unit/${unit.id}`}
            className="inline-flex min-h-9 items-center text-sm font-medium text-zinc-900 underline underline-offset-2"
          >
            Manage Logs
          </Link>
        </section>
      ) : null}

      <section className="max-w-xl space-y-3" aria-labelledby="place-identity-heading">
        <h3 id="place-identity-heading" className="text-sm font-semibold text-zinc-900">
          Identity
        </h3>
        <form action={updateBuilderUnitAction} className="grid gap-3">
          <input type="hidden" name="unitId" value={unit.id} />
          {displayKind === "floor" && <input type="hidden" name="parentUnitId" value="" />}
          {displayKind !== "floor" && unit.parentUnitId && (
            <input type="hidden" name="parentUnitId" value={unit.parentUnitId} />
          )}
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Name
            <input
              name="name"
              defaultValue={unit.name}
              required
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Description
            <input
              name="description"
              defaultValue={unit.description ?? ""}
              placeholder="Optional notes"
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" name="isActive" defaultChecked={unit.isActive} className="rounded" />
            Active
          </label>

          {displayKind !== "floor" && (
            <details className="rounded-md border border-zinc-100 bg-zinc-50/60 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-zinc-600">
                Advanced operational settings
              </summary>
              <div className="mt-3 space-y-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                  Legacy operational type
                  <select
                    name="unitType"
                    defaultValue={unit.unitType}
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
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

          <div>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </section>

      {displayKind !== "floor" && (
        <section className="border-t border-zinc-100 pt-5">
          <DepartmentResponsibilityCheckboxes
            mode="unit"
            locationId={unit.id}
            locationName={unit.name}
            selectedDepartmentIds={unit.departmentResponsibilities.map((r) => r.department.id)}
            departments={departments}
            unitForDescendants={unit}
            level2Singular={copy.labels.level2}
            level2Plural={copy.labels.level2Plural}
            level3Singular={copy.labels.level3}
            level3Plural={copy.labels.level3Plural}
          />
        </section>
      )}

      {displayKind === "floor" && (
        <section className="space-y-4 border-t border-zinc-100 pt-5">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-900">
                {copy.labels.level2Plural}
              </h3>
              {canAddNeighborhood(displayKind) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="compact"
                  onClick={() => onCreateNeighborhood(unit.id)}
                  icon={<Plus className="h-3.5 w-3.5" />}
                >
                  Add {copy.labels.level2.toLowerCase()}
                </Button>
              ) : null}
            </div>
            {unit.childUnits.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                No {copy.labels.level2Plural.toLowerCase()} on this {copy.labels.level1.toLowerCase()} yet.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-100">
                {unit.childUnits.map((child) => (
                  <li key={child.id}>
                    <button
                      type="button"
                      onClick={() => onSelectUnit(child.id)}
                      className="flex w-full items-center gap-2 py-2.5 text-left text-sm text-zinc-800 hover:text-zinc-950"
                    >
                      <LayoutGrid className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                      <span className={!child.isActive ? "opacity-50" : undefined}>{child.name}</span>
                      <span className="ml-auto text-xs text-zinc-400 tabular-nums">
                        {child.childSpaces.length} {copy.labels.level3Plural.toLowerCase()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-900">
                {copy.labels.level3Plural} on this {copy.labels.level1}
              </h3>
              {canAddRoom(displayKind) ? (
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    onClick={() => onCreateSpace(unit.id)}
                    icon={<Plus className="h-3.5 w-3.5" />}
                  >
                    Add {copy.labels.level3.toLowerCase()}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    onClick={() => onBulkCreateSpace(unit.id)}
                    icon={<ListPlus className="h-3.5 w-3.5" />}
                  >
                    Bulk add
                  </Button>
                </div>
              ) : null}
            </div>
            {unit.childSpaces.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                No {copy.labels.level3Plural.toLowerCase()} directly on this {copy.labels.level1.toLowerCase()}.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-100">
                {unit.childSpaces.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onSelectSpace(s.id, unit.id)}
                      className="flex w-full items-center gap-2 py-2.5 text-left text-sm text-zinc-800 hover:text-zinc-950"
                    >
                      <DoorOpen className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                      <span className={!s.isActive ? "opacity-50" : undefined}>
                        {formatRoomDisplayName(s)}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {roomTypeDisplayLabel(s, roomTypes)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {displayKind === "neighborhood" && (
        <section className="border-t border-zinc-100 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">{copy.labels.level3Plural}</h3>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant="ghost"
                size="compact"
                onClick={() => onCreateSpace(unit.id)}
                icon={<Plus className="h-3.5 w-3.5" />}
              >
                Add {copy.labels.level3.toLowerCase()}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="compact"
                data-testid="add-multiple-rooms-editor-section"
                onClick={() => onBulkCreateSpace(unit.id)}
                icon={<ListPlus className="h-3.5 w-3.5" />}
              >
                Bulk add {copy.labels.level3Plural.toLowerCase()}
              </Button>
            </div>
          </div>
          {unit.childSpaces.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">
              No {copy.labels.level3Plural.toLowerCase()} here yet.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-100">
              {unit.childSpaces.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onSelectSpace(s.id, unit.id)}
                    className="flex w-full items-center gap-2 py-2.5 text-left text-sm text-zinc-800 hover:text-zinc-950"
                  >
                    <DoorOpen className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                    <span className={!s.isActive ? "opacity-50" : undefined}>
                      {formatRoomDisplayName(s)}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {roomTypeDisplayLabel(s, roomTypes)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {displayKind === "floor" && (
        <section className="border-t border-zinc-100 pt-5">
          <FloorBulkDepartmentApply
            floor={unit}
            departments={departments}
            level2Singular={copy.labels.level2}
            level2Plural={copy.labels.level2Plural}
            level3Singular={copy.labels.level3}
            level3Plural={copy.labels.level3Plural}
          />
        </section>
      )}

      <details className="border-t border-zinc-100 pt-4">
        <summary className="cursor-pointer text-xs font-medium text-zinc-500">More</summary>
        <form
          action={async (formData) => {
            try {
              await deleteBuilderUnitAction(formData);
            } catch (err) {
              alert(err instanceof Error ? err.message : "Delete failed.");
            }
          }}
          className="mt-3"
        >
          <input type="hidden" name="unitId" value={unit.id} />
          <Button
            type="submit"
            variant="destructive"
            size="compact"
            onClick={(e) => {
              if (!confirm(copy.editor.deleteConfirm(unit.name))) {
                e.preventDefault();
              }
            }}
          >
            Delete
          </Button>
        </form>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Space editor (right panel — Room)
// ---------------------------------------------------------------------------

function SpaceEditor({
  space,
  parentUnit,
  parentFloorName,
  departments,
  isUndesignated = false,
  canonicalLogsEnabled = false,
}: {
  space: SpaceView;
  parentUnit: UnitHierarchyNode | null;
  parentFloorName: string | null;
  departments: { id: string; key: string; name: string }[];
  isUndesignated?: boolean;
  canonicalLogsEnabled?: boolean;
}) {
  const copy = useBuilderCopy();
  const roomTypes = useFacilityRoomTypes();
  const matchedType = space.facilityRoomTypeId
    ? roomTypes.find((row) => row.id === space.facilityRoomTypeId)
    : null;
  const roomTypeLabel = matchedType?.displayName ?? "Not assigned";
  const baseTypeLabel = matchedType?.baseTypeLabel ?? null;
  const parentPath = parentUnit
    ? parentFloorName && resolveBuilderNodeDisplayKind(parentUnit) !== "floor"
      ? `${parentUnit.name} · ${parentFloorName}`
      : parentUnit.name
    : copy.labels.undesignated;

  return (
    <div className="space-y-6" data-testid="facility-space-editor">
      {isUndesignated && <NotYetPlacedBanner />}

      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {formatRoomDisplayName(space)}
        </h2>
        <p className="text-sm font-medium text-zinc-800">
          {copy.editor.level3Badge} · {roomTypeLabel}
        </p>
        {baseTypeLabel ? (
          <p className="text-xs text-zinc-500">Base type: {baseTypeLabel}</p>
        ) : null}
        <p className="text-sm text-zinc-500">{parentPath}</p>
        {!space.isActive && (
          <span className="inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-500">
            Inactive
          </span>
        )}
      </header>

      {canonicalLogsEnabled ? (
        <section className="max-w-xl space-y-1" data-testid="facility-space-logs-link">
          <h3 className="text-sm font-semibold text-zinc-900">Logs</h3>
          <p className="text-xs text-zinc-500">Attach Catalog Logs to this room.</p>
          <Link
            href={`/build/logs/targets/space/${space.id}`}
            className="inline-flex min-h-9 items-center text-sm font-medium text-zinc-900 underline underline-offset-2"
          >
            Manage Logs
          </Link>
        </section>
      ) : null}

      <section className="max-w-xl space-y-3" aria-labelledby="room-identity-heading">
        <h3 id="room-identity-heading" className="text-sm font-semibold text-zinc-900">
          Identity
        </h3>
        <form action={updateBuilderSpaceAction} className="grid gap-3">
          <input type="hidden" name="spaceId" value={space.id} />
          {parentUnit && <input type="hidden" name="unitId" value={parentUnit.id} />}
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Name
            <input
              name="name"
              defaultValue={space.name}
              required
              placeholder="e.g. Central Kitchen, Dietitian Office, Room 101"
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
            />
          </label>
          <FacilityRoomTypeSelect
            defaultRoomTypeId={space.facilityRoomTypeId ?? defaultFacilityRoomTypeId(roomTypes)}
          />
          <details className="rounded-md border border-zinc-100 bg-zinc-50/60 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-zinc-600">
              Optional number / code
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                {copy.editor.level3NumberLabel}
                <input
                  name="roomNumber"
                  defaultValue={space.roomNumber ?? ""}
                  placeholder="Optional — e.g. 101"
                  maxLength={32}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                Code
                <input
                  name="code"
                  defaultValue={space.code ?? ""}
                  placeholder="Optional short code"
                  maxLength={20}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                />
              </label>
            </div>
          </details>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Description
            <input
              name="description"
              defaultValue={space.description ?? ""}
              placeholder="Optional notes"
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" name="isActive" defaultChecked={space.isActive} className="rounded" />
            Active
          </label>
          <div>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </section>

      <section className="border-t border-zinc-100 pt-5">
        <DepartmentResponsibilityCheckboxes
          mode="space"
          locationId={space.id}
          locationName={space.name}
          selectedDepartmentIds={space.responsibilities.map((r) => r.department.id)}
          departments={departments}
        />
      </section>

      <details className="border-t border-zinc-100 pt-4">
        <summary className="cursor-pointer text-xs font-medium text-zinc-500">More</summary>
        <form
          action={async (formData) => {
            try {
              await deleteBuilderSpaceAction(formData);
            } catch (err) {
              alert(err instanceof Error ? err.message : "Delete failed.");
            }
          }}
          className="mt-3"
        >
          <input type="hidden" name="spaceId" value={space.id} />
          <Button
            type="submit"
            variant="destructive"
            size="compact"
            onClick={(e) => {
              if (!confirm(`Delete "${space.name}"? This cannot be undone.`)) {
                e.preventDefault();
              }
            }}
          >
            Delete
          </Button>
        </form>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Facility Room Type picker
// ---------------------------------------------------------------------------

function FacilityRoomTypeSelect({
  defaultRoomTypeId,
}: {
  defaultRoomTypeId?: string;
}) {
  const roomTypes = useFacilityRoomTypes();
  const active = activeRoomTypes(roomTypes);
  const fallbackId = defaultFacilityRoomTypeId(roomTypes);
  const selectedId = defaultRoomTypeId && active.some((row) => row.id === defaultRoomTypeId)
    ? defaultRoomTypeId
    : fallbackId;

  if (active.length === 0) {
    return (
      <p className="text-sm text-amber-800">
        No Room Types are available.{" "}
        <a
          href="/admin/facility/builder?tab=room-types"
          className="font-medium underline underline-offset-2"
        >
          Add Room Types
        </a>{" "}
        before assigning rooms.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Room Type
        <select
          name="facilityRoomTypeId"
          defaultValue={selectedId}
          required
          data-testid="facility-room-type-select"
          className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        >
          {active.map((row) => (
            <option key={row.id} value={row.id}>
              {row.displayName}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-zinc-500">
        Changes this room&apos;s facility classification. Does not change Departments, Teams, or
        Operational Cycles.{" "}
        <a
          href="/admin/facility/builder?tab=room-types"
          className="font-medium text-zinc-700 underline underline-offset-2"
        >
          Manage Room Types
        </a>
      </p>
    </div>
  );
}

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
      <FacilityRoomTypeSelect />
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
      <FacilityRoomTypeSelect />
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

"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  type SortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

const subscribeToHydration = () => () => {};

import {
  DepartmentAdminActionForm,
  DepartmentAdminFormCloseContext,
} from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import {
  createCycleDraftAction,
  deleteCycleDraftAction,
  moveCycleTreeAction,
  updateCycleDraftAction,
} from "@/app/(protected)/admin/departments/[departmentId]/cycle-actions";
import { CycleRowActionsMenu } from "@/app/(protected)/admin/departments/[departmentId]/cycle-row-actions-menu";
import {
  CycleEditorFields,
  type CycleEditorCatalog,
  type CycleRowData,
} from "@/app/(protected)/admin/departments/[departmentId]/cycles-builder-controls";
import { Drawer } from "@/components/drawer";
import {
  CyclePeriodTemporalStrip,
  collectDescendantRows,
} from "@/app/(protected)/admin/departments/[departmentId]/cycle-period-temporal-strip";
import {
  formatCycleRowSecondary,
  formatCycleWindow,
  formatDaysSummary,
  formatCycleClock,
} from "@/lib/operational-cycles/cycle-display";
import {
  effectiveMealType,
  parentOptionsForCycle,
  projectCycleHierarchy,
  type CycleHierarchyTreeNode,
} from "@/lib/operational-cycles/cycle-hierarchy";
import {
  computeCycleTreeMove,
  type CycleTreeMovePlacement,
} from "@/lib/operational-cycles/cycle-tree-move";
import {
  scopeGroupLabel,
  shouldShowServiceStartTimes,
} from "@/lib/operational-cycles/cycle-scope";

function rowScopeLabel(
  row: Pick<CycleRowData, "locationMode" | "roomTypeKey" | "unitIds" | "spaceIds">,
  catalog?: CycleEditorCatalog,
  opts?: { includeLegacy?: boolean },
): string | null {
  if (row.locationMode === "UNIT_TYPES" && !opts?.includeLegacy) {
    return null;
  }
  const names: Record<string, string> = {};
  for (const location of catalog?.locations ?? []) names[location.id] = location.name;
  return scopeGroupLabel({
    locationMode: row.locationMode as
      | "ALL_DEPARTMENT_UNITS"
      | "UNIT_TYPES"
      | "EXPLICIT_UNITS"
      | "ROOM_TYPE",
    roomTypeKey: row.roomTypeKey,
    unitIds: row.unitIds,
    spaceIds: row.spaceIds,
    locationNames: names,
  });
}

function keyTimeSummary(
  row: Pick<CycleRowData, "nodeKind" | "keyTimeGroups">,
): string | null {
  if (row.nodeKind !== "KEY_TIME") return null;
  if (row.keyTimeGroups.length === 0) return "No due-time groups yet";
  return row.keyTimeGroups
    .map((group) => {
      const rooms = group.spaceIds.length;
      const clock = formatCycleClock(group.dueLocal);
      return rooms > 0
        ? `${clock} · ${rooms} room${rooms === 1 ? "" : "s"}`
        : clock;
    })
    .join(" · ");
}

function rowSecondary(
  row: CycleRowData,
  showMeal: boolean,
  catalog?: CycleEditorCatalog,
  opts?: { includeLegacy?: boolean },
): string {
  if (row.nodeKind === "KEY_TIME") {
    const summary = keyTimeSummary(row);
    return summary ?? "Key Time";
  }
  const parts: string[] = [];
  parts.push(
    formatCycleRowSecondary({
      label: row.label,
      startLocal: row.startLocal ?? "",
      endLocal: row.endLocal ?? "",
      mealType: showMeal ? row.mealType : null,
      daysSummary: formatDaysSummary(row.applicableDaysOfWeek),
      scopeLabel: row.locationInheritFromParent
        ? "Uses parent locations"
        : rowScopeLabel(row, catalog, opts),
      serviceTimeCount: shouldShowServiceStartTimes({
        cycleType: row.cycleType,
        mealType: row.mealType,
        expectedMilestones: row.expectedMilestones,
      })
        ? row.milestoneTimes.filter((t) => t.milestone === "SERVICE_STARTED" && t.configuredTime)
            .length
        : 0,
    }),
  );
  return parts.join(" · ");
}

function keyTimeTitle(row: CycleRowData): string {
  return `◆ ${row.label}`;
}

type TreeNode = CycleHierarchyTreeNode<
  CycleRowData & { mealType: "BREAKFAST" | "LUNCH" | "DINNER" | null }
>;

function indentPx(depth: number): number {
  return Math.min(depth, 3) * 14;
}

/** Prefer the smallest (deepest) hit so parent majors don't steal sibling drops. */
const cycleTreeCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) {
    const ranked = pointerHits.slice().sort((a, b) => {
      const rectA = args.droppableRects.get(a.id);
      const rectB = args.droppableRects.get(b.id);
      const areaA = rectA ? rectA.width * rectA.height : Number.POSITIVE_INFINITY;
      const areaB = rectB ? rectB.width * rectB.height : Number.POSITIVE_INFINITY;
      return areaA - areaB;
    });
    return ranked.slice(0, 1);
  }
  return closestCenter(args);
};

/** Tree DnD uses drop indicators + server updates; avoid flat-list layout shifts. */
const retainTreeOrderStrategy: SortingStrategy = () => null;

function SortableCycleRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (args: {
    setNodeRef: (node: HTMLElement | null) => void;
    style: CSSProperties;
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
    isDragging: boolean;
  }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };
  return <>{children({ setNodeRef, style, attributes, listeners, isDragging })}</>;
}

/** SSR-safe row shell — avoids dnd-kit aria-describedby hydration mismatches. */
function StaticCycleRow({
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (args: {
    setNodeRef: (node: HTMLElement | null) => void;
    style: CSSProperties;
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
    isDragging: boolean;
  }) => ReactNode;
}) {
  return (
    <>
      {children({
        setNodeRef: () => {},
        style: {},
        attributes: {} as ReturnType<typeof useSortable>["attributes"],
        listeners: undefined,
        isDragging: false,
      })}
    </>
  );
}

function DropIndicator({ active }: { active: boolean }) {
  if (!active) return null;
  return <div className="mx-3 h-0.5 rounded-full bg-zinc-800" data-testid="cycle-drop-indicator" />;
}

export function CompactDraftList({
  departmentId,
  rows,
  parentContext = [],
  showMeal,
  canReorder,
  catalog,
  nextDayKey,
}: {
  departmentId: string;
  rows: CycleRowData[];
  /** Published cycles used so a draft Phase can stay under its current parent. */
  parentContext?: CycleRowData[];
  showMeal: boolean;
  canReorder: boolean;
  catalog?: CycleEditorCatalog;
  nextDayKey: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openedFromReview, setOpenedFromReview] = useState(false);
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [addingKind, setAddingKind] = useState<"PERIOD" | "KEY_TIME">("PERIOD");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<CycleTreeMovePlacement>("after");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveNotice, setMoveNotice] = useState<string | null>(null);
  // dnd-kit accessibility IDs differ between SSR and client; enable after hydration.
  const dndReady = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  const CycleRow = dndReady ? SortableCycleRow : StaticCycleRow;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const draftIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const treeRows = useMemo(() => {
    const byKey = new Map<string, CycleRowData>();
    for (const row of parentContext) byKey.set(row.stableKey, row);
    for (const row of rows) byKey.set(row.stableKey, row);
    const neededParents = new Set(
      rows.map((row) => row.parentStableKey).filter((key): key is string => Boolean(key)),
    );
    const extras = [...neededParents]
      .map((key) => byKey.get(key))
      .filter((row): row is CycleRowData => {
        if (!row) return false;
        return !rows.some((draft) => draft.stableKey === row.stableKey);
      });
    return [...extras, ...rows];
  }, [rows, parentContext]);

  const tree = useMemo(
    () =>
      projectCycleHierarchy(
        treeRows.map((row) => ({
          ...row,
          mealType: row.mealType as "BREAKFAST" | "LUNCH" | "DINNER" | null,
          nodeKind: row.nodeKind,
        })),
      ),
    [treeRows],
  );

  const byId = useMemo(() => new Map(treeRows.map((r) => [r.id, r])), [treeRows]);
  const sortableIds = useMemo(() => rows.map((r) => r.id), [rows]);

  function expandAncestorsOf(id: string) {
    const row = byId.get(id);
    if (!row) return;
    setCollapsed((prev) => {
      const next = { ...prev };
      const byKey = new Map(treeRows.map((item) => [item.stableKey, item]));
      let parentKey = row.parentStableKey;
      while (parentKey) {
        next[parentKey] = false;
        parentKey = byKey.get(parentKey)?.parentStableKey ?? null;
      }
      return next;
    });
  }

  function openEditor(id: string) {
    setEditingId(id);
    setAddingUnder(null);
    setOpenedFromReview(false);
    expandAncestorsOf(id);
  }

  function closeEditor() {
    const fromReview = openedFromReview;
    setEditingId(null);
    setOpenedFromReview(false);
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash.startsWith("edit-cycle-")) {
        history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}${fromReview ? "#review-publish" : ""}`,
        );
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }
    }
  }

  useEffect(() => {
    function onHash() {
      if (typeof window === "undefined") return;
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash.startsWith("edit-cycle-")) return;
      const raw = hash.slice("edit-cycle-".length);
      const cycleId = raw.split(":")[0] ?? "";
      const fromReview = raw.endsWith(":review");
      if (cycleId && byId.has(cycleId)) {
        setEditingId(cycleId);
        setAddingUnder(null);
        setOpenedFromReview(fromReview);
        expandAncestorsOf(cycleId);
      }
    }
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [byId]);

  useEffect(() => {
    if (!editingId) return;
    const focusId = `edit-${editingId}-label`;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(focusId)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingId]);

  function closeAdding() {
    setAddingUnder(null);
  }

  function parentOptionsFor(stableKey: string) {
    const optionSource = [...parentContext, ...rows];
    const unique = new Map<string, CycleRowData>();
    for (const row of optionSource) unique.set(row.stableKey, row);
    const optionRows = [...unique.values()];
    const options = parentOptionsForCycle({
      stableKey,
      rows: optionRows.map((r) => ({
        stableKey: r.stableKey,
        label: r.label,
        parentStableKey: r.parentStableKey,
        displaySequence: r.displaySequence,
        nodeKind: r.nodeKind,
      })),
    });
    const current = optionRows.find((r) => r.stableKey === stableKey);
    const parentKey = current?.parentStableKey;
    if (parentKey && !options.some((o) => o.stableKey === parentKey)) {
      const parent = optionRows.find((r) => r.stableKey === parentKey);
      if (parent) {
        options.unshift({
          stableKey: parent.stableKey,
          label: parent.label,
          depth: 0,
          displayPath: parent.label,
        });
      }
    }
    return options;
  }

  function inheritedMealFor(row: CycleRowData) {
    return effectiveMealType({
      mealType: (row.mealType as "BREAKFAST" | "LUNCH" | "DINNER" | null) ?? null,
      stableKey: row.stableKey,
      rows: treeRows.map((r) => ({
        stableKey: r.stableKey,
        label: r.label,
        parentStableKey: r.parentStableKey,
        mealType: (r.mealType as "BREAKFAST" | "LUNCH" | "DINNER" | null) ?? null,
      })),
    });
  }

  function persistMove(nextActiveId: string, nextOverId: string, nextPlacement: CycleTreeMovePlacement) {
    const preview = computeCycleTreeMove({
      rows,
      activeId: nextActiveId,
      overId: nextOverId,
      placement: nextPlacement,
    });
    if (!preview.ok) {
      setMoveError(preview.reason);
      setMoveNotice(null);
      return;
    }
    setMoveError(null);
    setMoveNotice(preview.summary);
    const formData = new FormData();
    formData.set("departmentId", departmentId);
    formData.set("activeId", nextActiveId);
    formData.set("overId", nextOverId);
    formData.set("placement", nextPlacement);
    startTransition(async () => {
      const result = await moveCycleTreeAction(formData);
      if (!result.ok) {
        setMoveError(result.message);
        setMoveNotice(null);
      } else if (result.message) {
        setMoveNotice(result.message);
      }
      router.refresh();
    });
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setMoveError(null);
  }

  function onDragOver(event: DragOverEvent) {
    const over = event.over?.id ? String(event.over.id) : null;
    setOverId(over);
    if (!over || !event.active) return;
    if (String(event.active.id) === over) return;
    const overRow = byId.get(over);
    const activeRow = byId.get(String(event.active.id));
    if (!overRow) return;

    const translated = event.over?.rect;
    const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial;
    if (!translated || !activeRect) {
      setPlacement("after");
      return;
    }
    const pointerY = activeRect.top + activeRect.height / 2;
    const ratio = (pointerY - translated.top) / Math.max(translated.height, 1);

    const sameParent =
      (activeRow?.parentStableKey ?? null) === (overRow.parentStableKey ?? null) &&
      activeRow?.parentStableKey != null;

    // Sibling reorder within a group: only before/after (never "inside" the sibling).
    if (sameParent) {
      setPlacement(ratio < 0.5 ? "before" : "after");
      return;
    }

    // Drop onto a major (or nestable phase) mid-row to reparent as a child.
    const canNestInside = overRow.nodeKind !== "KEY_TIME";
    if (canNestInside && ratio > 0.25 && ratio < 0.75) {
      setPlacement("inside");
    } else if (ratio < 0.5) {
      setPlacement("before");
    } else {
      setPlacement("after");
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const nextActive = String(event.active.id);
    const nextOver = event.over?.id ? String(event.over.id) : null;
    const nextPlacement = placement;
    setActiveId(null);
    setOverId(null);
    if (!nextOver || nextActive === nextOver || !canReorder) return;
    if (!draftIds.has(nextActive) || !draftIds.has(nextOver)) return;
    persistMove(nextActive, nextOver, nextPlacement);
  }

  function renderPhase(node: TreeNode, parentLabel: string): ReactNode {
    const row = byId.get(node.source.id!);
    if (!row) return null;
    const editing = editingId === row.id;
    const isCollapsed = collapsed[row.stableKey] ?? false;
    const inheritedMeal = inheritedMealFor(row);
    const showDropBefore = activeId && overId === row.id && placement === "before";
    const showDropAfter = activeId && overId === row.id && placement === "after";
    const showDropInside = activeId && overId === row.id && placement === "inside";

    return (
      <CycleRow key={row.id} id={row.id} disabled={!canReorder || pending}>
        {({ setNodeRef, style, attributes, listeners }) => (
          <div
            data-testid="cycle-row"
            data-cycle-depth={node.depth}
            data-cycle-role={row.nodeKind === "KEY_TIME" ? "key_time" : "phase"}
            className={`border-b border-zinc-100 last:border-0 ${
              editing ? "bg-zinc-50" : "bg-white"
            } ${showDropInside ? "ring-1 ring-inset ring-zinc-700" : ""}`}
          >
            <DropIndicator active={Boolean(showDropBefore)} />
            <div
              ref={setNodeRef}
              style={{ paddingLeft: `${14 + indentPx(node.depth)}px`, ...style }}
              className="flex items-start gap-1.5 px-3 py-2"
              data-testid="cycle-drop-target"
            >
              {canReorder && dndReady ? (
                <button
                  type="button"
                  aria-label={`Drag ${row.label}`}
                  className="mt-0.5 cursor-grab touch-none rounded px-1 py-0.5 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 active:cursor-grabbing"
                  data-testid="cycle-drag-handle"
                  {...attributes}
                  {...listeners}
                >
                  <span className="block text-sm leading-none tracking-tighter">⋮⋮</span>
                </button>
              ) : canReorder ? (
                <span className="mt-0.5 inline-block w-5 shrink-0" aria-hidden />
              ) : null}

              {node.hasChildren ? (
                <button
                  type="button"
                  aria-label={isCollapsed ? `Expand ${row.label}` : `Collapse ${row.label}`}
                  aria-expanded={!isCollapsed}
                  className="mt-0.5 w-5 shrink-0 text-zinc-500"
                  data-testid="cycle-expand"
                  onClick={(event) => {
                    event.stopPropagation();
                    setCollapsed((prev) => ({ ...prev, [row.stableKey]: !isCollapsed }));
                  }}
                >
                  {isCollapsed ? "▸" : "▾"}
                </button>
              ) : (
                <span className="mt-0.5 w-5 shrink-0 text-center text-xs text-zinc-300">·</span>
              )}

              <button
                type="button"
                className="min-w-0 flex-1 rounded-md px-1 py-0.5 text-left hover:bg-zinc-50"
                data-testid="cycle-open-target"
                onClick={() => openEditor(row.id)}
              >
                <p className="truncate text-sm font-medium text-zinc-900">
                  {row.nodeKind === "KEY_TIME" ? keyTimeTitle(row) : row.label}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {row.nodeKind === "KEY_TIME" ? (
                    rowSecondary(row, showMeal, catalog)
                  ) : (
                    <>
                      {row.startLocal && row.endLocal
                        ? formatCycleWindow(row.startLocal, row.endLocal)
                        : null}
                      {row.locationInheritFromParent
                        ? " · Uses parent locations"
                        : ""}
                      {node.hasChildren
                        ? ` · ${node.children.length} nested`
                        : ""}
                    </>
                  )}
                </p>
              </button>
              <CycleRowActionsMenu
                departmentId={departmentId}
                cycleId={row.id}
                objectLabel={row.label}
                ariaLabel={`Actions for ${row.label}`}
                actions={[
                  row.nodeKind === "KEY_TIME"
                    ? "delete-draft-key-time"
                    : "delete-draft-phase",
                ]}
              />
            </div>

            {!isCollapsed
              ? node.children.map((child) => renderPhase(child, `${parentLabel} → ${row.label}`))
              : null}
            <DropIndicator active={Boolean(showDropAfter)} />
          </div>
        )}
      </CycleRow>
    );
  }

  function renderRoot(node: TreeNode): ReactNode {
    const row = byId.get(node.source.id!);
    if (!row) return null;
    const isContextParent = !draftIds.has(row.id);
    const editing = editingId === row.id;
    const isCollapsed = collapsed[row.stableKey] ?? false;
    const inheritedMeal = inheritedMealFor(row);
    const showDropBefore = !isContextParent && activeId && overId === row.id && placement === "before";
    const showDropAfter = !isContextParent && activeId && overId === row.id && placement === "after";
    const showDropInside = !isContextParent && activeId && overId === row.id && placement === "inside";
    const phaseCount = node.children.length;
    const RowComponent = isContextParent ? StaticCycleRow : CycleRow;
    const descendants = collectDescendantRows(node, byId);

    return (
      <RowComponent key={row.id} id={row.id} disabled={isContextParent || !canReorder || pending}>
        {({ setNodeRef, style, attributes, listeners }) => (
          <div
            data-testid="cycle-row"
            data-cycle-depth={0}
            data-cycle-role="major"
            className={`mb-3 overflow-hidden rounded-lg border border-zinc-200 bg-white ${
              editing ? "ring-2 ring-amber-700/40 ring-offset-1" : ""
            } ${showDropInside ? "ring-2 ring-zinc-700 ring-offset-1" : ""}`}
          >
            <DropIndicator active={Boolean(showDropBefore)} />
            <div
              ref={isContextParent ? undefined : setNodeRef}
              style={isContextParent ? undefined : style}
              className="flex items-start gap-2 border-b border-zinc-200/80 px-3 py-3"
              data-testid="cycle-drop-target"
            >
              {!isContextParent && canReorder && dndReady ? (
                <button
                  type="button"
                  aria-label={`Drag ${row.label}`}
                  className="mt-1 cursor-grab touch-none rounded px-1 py-0.5 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 active:cursor-grabbing"
                  data-testid="cycle-drag-handle"
                  {...attributes}
                  {...listeners}
                >
                  <span className="block text-sm leading-none tracking-tighter">⋮⋮</span>
                </button>
              ) : canReorder ? (
                <span className="mt-1 inline-block w-5 shrink-0" aria-hidden />
              ) : null}

              {node.hasChildren ? (
                <button
                  type="button"
                  aria-label={isCollapsed ? `Expand ${row.label}` : `Collapse ${row.label}`}
                  aria-expanded={!isCollapsed}
                  className="mt-1 w-5 shrink-0 text-zinc-500"
                  data-testid="cycle-expand"
                  onClick={(event) => {
                    event.stopPropagation();
                    setCollapsed((prev) => ({ ...prev, [row.stableKey]: !isCollapsed }));
                  }}
                >
                  {isCollapsed ? "▸" : "▾"}
                </button>
              ) : (
                <span className="mt-1 w-5 shrink-0 text-center text-xs text-zinc-300">·</span>
              )}

              {isContextParent ? (
                <div className="min-w-0 flex-1 px-1 py-0.5">
                  <p className="truncate text-base font-semibold tracking-tight text-zinc-900">
                    {row.label}
                  </p>
                  <p className="truncate text-xs text-zinc-600">
                    Current Operational Cycle · draft changes are nested below
                  </p>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-md px-1 py-0.5 text-left hover:bg-black/5"
                    data-testid="cycle-open-target"
                    onClick={() => openEditor(row.id)}
                  >
                    <p className="truncate text-base font-semibold tracking-tight text-zinc-900">
                      {row.label}
                    </p>
                    <p className="truncate text-xs text-zinc-600">
                      {rowSecondary(
                        { ...row, mealType: row.mealType || inheritedMeal },
                        showMeal,
                        catalog,
                      )}
                      {phaseCount > 0
                        ? ` · ${phaseCount} item${phaseCount === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </button>
                  <CycleRowActionsMenu
                    departmentId={departmentId}
                    cycleId={row.id}
                    objectLabel={row.label}
                    ariaLabel={`Actions for ${row.label}`}
                    actions={["delete-draft-root"]}
                  />
                </>
              )}
            </div>

            {!isContextParent ? (
              <CyclePeriodTemporalStrip
                root={row}
                descendants={descendants}
                selectedId={editingId}
                interactive={!isContextParent}
                onSelectId={(id) => openEditor(id)}
                showEmptyActions
                onAddPhase={() => {
                  setAddingKind("PERIOD");
                  setAddingUnder(row.stableKey);
                  setEditingId(null);
                  setCollapsed((prev) => ({ ...prev, [row.stableKey]: false }));
                }}
                onAddKeyTime={() => {
                  setAddingKind("KEY_TIME");
                  setAddingUnder(row.stableKey);
                  setEditingId(null);
                  setCollapsed((prev) => ({ ...prev, [row.stableKey]: false }));
                }}
              />
            ) : null}

            {!isCollapsed ? (
              <div className="bg-white">
                <p className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Structure
                </p>
                {node.children.map((child) => renderPhase(child, row.label))}
                {descendants.length > 0 ? (
                  <div className="px-3 py-2">
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        className="min-h-9 text-xs font-medium text-zinc-700 hover:text-zinc-900"
                        data-testid="add-phase-cycle"
                        onClick={(event) => {
                          event.stopPropagation();
                          setAddingKind("PERIOD");
                          setAddingUnder(row.stableKey);
                          setEditingId(null);
                          setCollapsed((prev) => ({ ...prev, [row.stableKey]: false }));
                        }}
                      >
                        + Add phase
                      </button>
                      <button
                        type="button"
                        className="min-h-9 text-xs font-medium text-zinc-700 hover:text-zinc-900"
                        data-testid="add-key-time-cycle"
                        onClick={(event) => {
                          event.stopPropagation();
                          setAddingKind("KEY_TIME");
                          setAddingUnder(row.stableKey);
                          setEditingId(null);
                          setCollapsed((prev) => ({ ...prev, [row.stableKey]: false }));
                        }}
                      >
                        + Add key time
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <DropIndicator active={Boolean(showDropAfter)} />
          </div>
        )}
      </RowComponent>
    );
  }

  const activeRow = activeId ? byId.get(activeId) : null;
  const editingRow = editingId ? byId.get(editingId) : null;
  const addingParent = addingUnder
    ? treeRows.find((row) => row.stableKey === addingUnder) ?? null
    : null;

  return (
    <div className="space-y-2" data-testid="cycles-draft-list" aria-busy={pending}>
      {moveError ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {moveError}
        </p>
      ) : null}
      {moveNotice && !moveError ? (
        <p className="text-xs text-zinc-500" data-testid="cycle-move-notice">
          {moveNotice}
        </p>
      ) : null}
      {dndReady ? (
        <DndContext
          id="cycles-draft-tree"
          sensors={sensors}
          collisionDetection={cycleTreeCollision}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            setOverId(null);
          }}
        >
          <SortableContext items={sortableIds} strategy={retainTreeOrderStrategy}>
            {tree.roots.length === 0 ? (
              <p className="rounded-lg border border-zinc-200 bg-white px-3 py-4 text-sm text-zinc-500">
                No draft cycles.
              </p>
            ) : (
              tree.roots.map((root) => renderRoot(root))
            )}
          </SortableContext>
          <DragOverlay>
            {activeRow ? (
              <div className="rounded-md border border-zinc-400 bg-white px-3 py-2 text-sm font-medium shadow-md">
                {activeRow.label}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : tree.roots.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-white px-3 py-4 text-sm text-zinc-500">
          No draft cycles.
        </p>
      ) : (
        tree.roots.map((root) => renderRoot(root))
      )}

      <Drawer
        open={Boolean(editingRow)}
        onClose={closeEditor}
        closeLabel="Cancel"
        title={
          editingRow
            ? `Edit ${editingRow.nodeKind === "KEY_TIME" ? "key time" : editingRow.parentStableKey ? "phase" : "operational cycle"}`
            : "Edit"
        }
      >
        {editingRow ? (
          <DepartmentAdminFormCloseContext.Provider value={closeEditor}>
            <div className="space-y-3" data-testid="cycle-editor">
              <p className="text-sm font-semibold text-zinc-900">{editingRow.label}</p>
              <p className="text-xs text-zinc-500">
                {editingRow.parentStableKey
                  ? "Nested under its parent in the tree."
                  : "Top-level operating period"}
              </p>
              {openedFromReview ? (
                <button
                  type="button"
                  className="text-xs font-medium text-zinc-700 underline"
                  data-testid="back-to-review"
                  onClick={closeEditor}
                >
                  Back to review
                </button>
              ) : null}
              {editingRow.locationMode === "UNIT_TYPES" ? (
                <p className="text-xs text-amber-800">Scope needs review</p>
              ) : null}
              {!editingRow.parentStableKey &&
              editingRow.nodeKind === "PERIOD" &&
              editingRow.locationInheritFromParent ? (
                <p
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
                  data-testid="detached-phase-hint"
                >
                  This phase is no longer under an Operational Cycle. Choose{" "}
                  <span className="font-medium">Part of</span> to put it back, then Save.
                </p>
              ) : null}
              <DepartmentAdminActionForm action={updateCycleDraftAction} className="space-y-3">
                <input type="hidden" name="departmentId" value={departmentId} />
                <input type="hidden" name="cycleId" value={editingRow.id} />
                <CycleEditorFields
                  key={`edit-fields-${editingRow.id}-${editingRow.parentStableKey ?? "root"}`}
                  idPrefix={`edit-${editingRow.id}`}
                  showMeal={showMeal && editingRow.nodeKind === "PERIOD"}
                  catalog={catalog}
                  parentOptions={parentOptionsFor(editingRow.stableKey)}
                  inheritedMealType={inheritedMealFor(editingRow)}
                  defaults={editingRow}
                />
                <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap gap-2 border-t border-zinc-200 bg-white/95 px-1 py-3 backdrop-blur">
                  <button
                    type="submit"
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                    onClick={closeEditor}
                    data-testid="cycle-editor-cancel"
                  >
                    Cancel
                  </button>
                </div>
              </DepartmentAdminActionForm>
              <DepartmentAdminActionForm action={deleteCycleDraftAction}>
                <input type="hidden" name="departmentId" value={departmentId} />
                <input type="hidden" name="cycleId" value={editingRow.id} />
                <p className="text-xs text-zinc-500">
                  {editingRow.nodeKind === "KEY_TIME"
                    ? "Delete permanently removes this unpublished key time."
                    : editingRow.parentStableKey
                      ? "Delete permanently removes this unpublished phase and any nested draft items."
                      : "Delete permanently removes this unpublished cycle and any nested draft phases or key times."}{" "}
                  Published configuration is not affected.
                </p>
                <button
                  type="submit"
                  className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100"
                  data-testid="cycle-editor-delete-draft"
                  onClick={(event) => {
                    const kind =
                      editingRow.nodeKind === "KEY_TIME"
                        ? "key time"
                        : editingRow.parentStableKey
                          ? "phase"
                          : "draft cycle";
                    if (
                      !window.confirm(
                        `Delete “${editingRow.label}”?\n\nThis ${kind} has not been published and will be permanently removed.`,
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  {editingRow.nodeKind === "KEY_TIME"
                    ? "Delete key time"
                    : editingRow.parentStableKey
                      ? "Delete phase"
                      : "Delete draft cycle"}
                </button>
              </DepartmentAdminActionForm>
            </div>
          </DepartmentAdminFormCloseContext.Provider>
        ) : null}
      </Drawer>

      <Drawer
        open={Boolean(addingParent)}
        onClose={closeAdding}
        closeLabel="Cancel"
        title={
          addingParent
            ? `Add ${addingKind === "KEY_TIME" ? "key time" : "phase"} to ${addingParent.label}`
            : "Add"
        }
      >
        {addingParent ? (
          <DepartmentAdminFormCloseContext.Provider value={closeAdding}>
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">Changes start as Draft.</p>
              <DepartmentAdminActionForm action={createCycleDraftAction} className="space-y-3">
                <input type="hidden" name="departmentId" value={departmentId} />
                <CycleEditorFields
                  idPrefix={`${addingKind.toLowerCase()}-${addingParent.stableKey}`}
                  showMeal={showMeal && addingKind === "PERIOD"}
                  compactCreate
                  catalog={catalog}
                  namePlaceholder={
                    addingKind === "KEY_TIME" ? "e.g. Breakfast Due" : "e.g. Prep, Cleanup"
                  }
                  parentOptions={parentOptionsFor(addingParent.stableKey).concat([
                    {
                      stableKey: addingParent.stableKey,
                      label: addingParent.label,
                      depth: 0,
                      displayPath: addingParent.label,
                    },
                  ])}
                  inheritedMealType={addingParent.mealType || inheritedMealFor(addingParent)}
                  defaults={{
                    nodeKind: addingKind,
                    parentStableKey: addingParent.stableKey,
                    effectiveFrom: nextDayKey,
                    cycleType: addingKind === "KEY_TIME" ? "CUSTOM" : "PREPARATION",
                    locationMode: "EXPLICIT_UNITS",
                    locationInheritFromParent: addingKind === "PERIOD",
                    applicableDaysOfWeek: addingParent.applicableDaysOfWeek,
                    mealType: "",
                    expectedMilestones: [],
                    keyTimeGroups:
                      addingKind === "KEY_TIME" ? [{ dueLocal: "", spaceIds: [] }] : [],
                    startLocal: addingKind === "KEY_TIME" ? null : addingParent.startLocal,
                    endLocal: addingKind === "KEY_TIME" ? null : addingParent.endLocal,
                  }}
                />
                <div className="sticky bottom-0 z-10 -mx-1 flex gap-2 border-t border-zinc-200 bg-white/95 px-1 py-3 backdrop-blur">
                  <button
                    type="submit"
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800"
                    onClick={closeAdding}
                    data-testid="cycle-add-cancel"
                  >
                    Cancel
                  </button>
                </div>
              </DepartmentAdminActionForm>
            </div>
          </DepartmentAdminFormCloseContext.Provider>
        ) : null}
      </Drawer>
    </div>
  );
}

export function CompactCycleReadonlyList({
  rows,
  showMeal,
  actionsById,
  catalog,
  editDraftIdByStableKey,
}: {
  rows: CycleRowData[];
  showMeal: boolean;
  actionsById?: Record<string, ReactNode>;
  catalog?: CycleEditorCatalog;
  /** When a draft already exists for this cycle, clicking the row opens that editor. */
  editDraftIdByStableKey?: Record<string, string>;
  /** @deprecated Hierarchy blocks replace scope grouping. */
  groupByScope?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tree = useMemo(
    () =>
      projectCycleHierarchy(
        rows.map((row) => ({
          ...row,
          mealType: row.mealType as "BREAKFAST" | "LUNCH" | "DINNER" | null,
          nodeKind: row.nodeKind,
        })),
      ),
    [rows],
  );
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  function startEdit(row: CycleRowData, selected: boolean) {
    const existingDraftId = editDraftIdByStableKey?.[row.stableKey];
    if (existingDraftId) {
      window.location.assign(`#edit-cycle-${existingDraftId}`);
      return;
    }
    const host = document.querySelector(`[data-cycle-edit="${row.id}"]`);
    const form = host?.querySelector("form");
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
      return;
    }
    setSelectedId(selected ? null : row.id);
  }

  function renderPhase(node: TreeNode, parentLabel: string): ReactNode {
    const row = byId.get(node.source.id!);
    if (!row) return null;
    const isCollapsed = collapsed[row.stableKey] ?? false;
    const selected = selectedId === row.id;
    const inheritedMeal = effectiveMealType({
      mealType: (row.mealType as "BREAKFAST" | "LUNCH" | "DINNER" | null) ?? null,
      stableKey: row.stableKey,
      rows: rows.map((r) => ({
        stableKey: r.stableKey,
        label: r.label,
        parentStableKey: r.parentStableKey,
        mealType: (r.mealType as "BREAKFAST" | "LUNCH" | "DINNER" | null) ?? null,
      })),
    });

    return (
      <div
        key={row.id}
        data-testid="cycle-row"
        data-cycle-depth={node.depth}
        data-cycle-role={row.nodeKind === "KEY_TIME" ? "key_time" : "phase"}
        className="border-b border-zinc-100 last:border-0 bg-white"
      >
        <div
          className="flex flex-wrap items-start gap-1.5 px-3 py-2"
          style={{ paddingLeft: `${14 + indentPx(node.depth)}px` }}
        >
          {node.hasChildren ? (
            <button
              type="button"
              aria-expanded={!isCollapsed}
              className="mt-0.5 w-5 shrink-0 text-zinc-500"
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, [row.stableKey]: !isCollapsed }))
              }
            >
              {isCollapsed ? "▸" : "▾"}
            </button>
          ) : (
            <span className="mt-0.5 w-5 shrink-0 text-center text-xs text-zinc-300">·</span>
          )}
          <button
            type="button"
            className="min-w-0 flex-1 basis-[10rem] rounded-md px-1 py-0.5 text-left hover:bg-zinc-50"
            data-testid="cycle-open-target"
            onClick={() => startEdit(row, selected)}
          >
            <p className="truncate text-sm font-medium text-zinc-900">
              {row.nodeKind === "KEY_TIME" ? keyTimeTitle(row) : row.label}
            </p>
            <p className="truncate text-xs text-zinc-500">
              {row.nodeKind === "KEY_TIME"
                ? rowSecondary(row, showMeal, catalog)
                : [
                    row.startLocal && row.endLocal
                      ? formatCycleWindow(row.startLocal, row.endLocal)
                      : null,
                    row.locationInheritFromParent ? "Uses parent locations" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || rowSecondary({ ...row, mealType: inheritedMeal }, showMeal, catalog)}
            </p>
          </button>
          {actionsById?.[row.id] ? (
            <div className="shrink-0">{actionsById[row.id]}</div>
          ) : null}
        </div>
        {selected ? (
          <div className="border-t border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            {parentLabel} → {row.label}
            {row.locationMode === "UNIT_TYPES" ? (
              <span className="mt-1 block text-amber-800">Scope needs review</span>
            ) : null}
          </div>
        ) : null}
        {!isCollapsed
          ? node.children.map((child) => renderPhase(child, `${parentLabel} → ${row.label}`))
          : null}
      </div>
    );
  }

  function renderRoot(node: TreeNode): ReactNode {
    const row = byId.get(node.source.id!);
    if (!row) return null;
    const isCollapsed = collapsed[row.stableKey] ?? false;
    const selected = selectedId === row.id;
    const phaseCount = node.children.length;
    const descendants = collectDescendantRows(node, byId);

    return (
      <div
        key={row.id}
        data-testid="cycle-row"
        data-cycle-depth={0}
        data-cycle-role="major"
        className="mb-3 overflow-hidden rounded-lg border border-zinc-200 bg-white"
      >
        <div className="flex flex-wrap items-start gap-2 border-b border-zinc-100 px-3 py-3">
          {node.hasChildren ? (
            <button
              type="button"
              aria-expanded={!isCollapsed}
              className="mt-1 w-5 shrink-0 text-zinc-500"
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, [row.stableKey]: !isCollapsed }))
              }
            >
              {isCollapsed ? "▸" : "▾"}
            </button>
          ) : (
            <span className="mt-1 w-5 shrink-0 text-center text-xs text-zinc-300">·</span>
          )}
          <button
            type="button"
            className="min-w-0 flex-1 basis-[10rem] rounded-md px-1 py-0.5 text-left hover:bg-zinc-50"
            data-testid="cycle-open-target"
            onClick={() => startEdit(row, selected)}
          >
            <p className="truncate text-base font-semibold tracking-tight text-zinc-900">
              {row.label}
            </p>
            <p className="truncate text-xs text-zinc-600">
              {[
                row.startLocal && row.endLocal
                  ? formatCycleWindow(row.startLocal, row.endLocal)
                  : null,
                formatDaysSummary(row.applicableDaysOfWeek),
                phaseCount > 0 ? `${phaseCount} items` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </button>
          {actionsById?.[row.id] ? (
            <div className="shrink-0">{actionsById[row.id]}</div>
          ) : null}
        </div>
        <CyclePeriodTemporalStrip
          root={row}
          descendants={descendants}
          selectedId={selectedId}
          readOnly
          interactive={Boolean(editDraftIdByStableKey)}
          onSelectId={(id) => {
            const target = byId.get(id);
            if (target) startEdit(target, selectedId === id);
          }}
        />
        {selected ? (
          <div className="border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            Top-level operating period
            {row.locationMode === "UNIT_TYPES" ? (
              <span className="mt-1 block text-amber-800">Scope needs review</span>
            ) : null}
          </div>
        ) : null}
        {!isCollapsed ? (
          <div className="bg-white">
            <p className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Structure
            </p>
            {node.children.map((child) => renderPhase(child, row.label))}
          </div>
        ) : null}
      </div>
    );
  }

  if (tree.roots.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-200 bg-white px-3 py-4 text-sm text-zinc-500">
        No cycles.
      </p>
    );
  }

  return <div className="space-y-0">{tree.roots.map((root) => renderRoot(root))}</div>;
}

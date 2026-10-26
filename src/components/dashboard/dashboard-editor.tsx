"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Children,
  isValidElement,
  useActionState,
  useEffect,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import {
  resetDashboardLayout,
  saveDashboardLayout,
  setDashboardFacilityDefault,
  type DashboardLayoutActionResult,
} from "@/app/(protected)/dashboard/actions";
import type { CardSize } from "@/lib/dashboard/cards/types";
import type { DashboardAuthority } from "@/lib/dashboard/viewer/types";

export type DashboardEditorCard = {
  card: string;
  title: string;
  category: string;
  sizes: readonly CardSize[];
  size: CardSize;
  rows: 1 | 2 | 3;
};

const SIZE_ORDER: readonly CardSize[] = ["S", "M", "L"];
const GRID_ID = "dashboard-grid";
const collisionDetection: CollisionDetection = (args) => {
  const cards = args.droppableContainers.filter(
    (container) => container.id !== args.active.id && container.id !== GRID_ID,
  );
  return closestCenter({
    ...args,
    droppableContainers: cards.length > 0 ? cards : args.droppableContainers,
  });
};

const CATEGORY_LABEL: Record<string, string> = {
  people: "People",
  locations: "Locations",
  operations: "Operations",
  maintenance: "Maintenance",
  records: "Records",
  menus: "Menus",
  administration: "Administration",
};

function rowMinHeight(rows: 1 | 2 | 3): string {
  return `calc(${rows} * 7.5rem + ${rows - 1} * 1rem)`;
}

function cardPreviews(children: ReactNode): Map<string, ReactNode> {
  const previews = new Map<string, ReactNode>();
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const id = (child.props as { "data-card"?: unknown })["data-card"];
    if (typeof id === "string") previews.set(id, child);
  });
  return previews;
}

function cardRows(value: number | undefined): 1 | 2 | 3 {
  if (value == null || !Number.isFinite(value)) return 1;
  return Math.min(3, Math.max(1, Math.round(value))) as 1 | 2 | 3;
}

function orderedSizes(sizes: readonly CardSize[]): CardSize[] {
  return SIZE_ORDER.filter((size) => sizes.includes(size));
}

function defaultSize(sizes: readonly CardSize[]): CardSize {
  if (sizes.includes("M")) return "M";
  return sizes[0] ?? "M";
}

function columnsOf(size: CardSize): number {
  if (size === "S") return 3;
  if (size === "M") return 6;
  return 12;
}

function shareSizes(
  left: DashboardEditorCard,
  right: DashboardEditorCard,
): { left: CardSize; right: CardSize } | null {
  let best: { left: CardSize; right: CardSize; score: number } | null = null;
  for (const leftSize of orderedSizes(left.sizes)) {
    for (const rightSize of orderedSizes(right.sizes)) {
      const used = columnsOf(leftSize) + columnsOf(rightSize);
      if (used > 12) continue;
      const score = used * 10 - Math.abs(columnsOf(leftSize) - columnsOf(rightSize));
      if (!best || score > best.score) best = { left: leftSize, right: rightSize, score };
    }
  }
  return best ? { left: best.left, right: best.right } : null;
}

function placeBeside(
  items: readonly DashboardEditorCard[],
  activeId: string,
  overId: string,
  side: "left" | "right",
): DashboardEditorCard[] {
  const active = items.find((item) => item.card === activeId);
  const over = items.find((item) => item.card === overId);
  if (!active || !over) return [...items];
  const leftCard = side === "left" ? active : over;
  const rightCard = side === "left" ? over : active;
  const shared = columnsOf(active.size) + columnsOf(over.size) <= 12 ? null : shareSizes(leftCard, rightCard);
  const sized = items.map((item) => {
    if (!shared) return item;
    if (item.card === leftCard.card) return { ...item, size: shared.left };
    if (item.card === rightCard.card) return { ...item, size: shared.right };
    return item;
  });
  const moving = sized.find((item) => item.card === activeId);
  if (!moving) return [...items];
  const rest = sized.filter((item) => item.card !== activeId);
  const overIndex = rest.findIndex((item) => item.card === overId);
  if (overIndex < 0) return [...items];
  rest.splice(side === "right" ? overIndex + 1 : overIndex, 0, moving);
  return rest;
}

function resizeWidth(items: readonly DashboardEditorCard[], activeId: string, dx: number): DashboardEditorCard[] {
  return items.map((item) => {
    if (item.card !== activeId) return item;
    const allowed = orderedSizes(item.sizes);
    const index = Math.max(0, allowed.indexOf(item.size));
    const steps = Math.trunc(dx / 72) || (dx > 0 ? 1 : -1);
    const next = allowed[Math.min(allowed.length - 1, Math.max(0, index + steps))] ?? item.size;
    return { ...item, size: next };
  });
}

function GridCard({
  item,
  preview,
  onResize,
  onRemove,
  onMove,
}: {
  item: DashboardEditorCard;
  preview: ReactNode;
  onResize: (size: CardSize, rows: 1 | 2 | 3) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.card,
  });
  const { onKeyDown: sortableKeyDown, ...dragListeners } = listeners ?? {};
  const canResizeWidth = orderedSizes(item.sizes).length > 1;
  const rows = cardRows(item.rows);
  const boxHeight = rowMinHeight(rows);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridRow: `span ${rows}`,
    minHeight: boxHeight,
    height: rows > 1 ? boxHeight : undefined,
  };

  function onResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const allowed = orderedSizes(item.sizes);
    const startIndex = Math.max(0, allowed.indexOf(item.size));
    const startRows = cardRows(item.rows);
    const move = (ev: PointerEvent) => {
      const widthSteps = canResizeWidth ? Math.trunc((ev.clientX - startX) / 32) : 0;
      const heightSteps = Math.trunc((ev.clientY - startY) / 48);
      const nextSize = allowed[Math.min(allowed.length - 1, Math.max(0, startIndex + widthSteps))] ?? item.size;
      const nextRows = cardRows(startRows + (Number.isFinite(heightSteps) ? heightSteps : 0));
      onResize(nextSize, nextRows);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${isDragging ? "opacity-40" : ""}`}
      data-testid={`dashboard-edit-card-${item.card}`}
      data-size={item.size}
      data-rows={String(rows)}
      {...attributes}
      {...dragListeners}
      aria-keyshortcuts="ArrowUp ArrowDown"
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          onMove(event.key === "ArrowDown" ? 1 : -1);
          return;
        }
        sortableKeyDown?.(event);
      }}
    >
      <div className="flex min-h-0 flex-1 items-start">
        <div className="min-w-0 flex-1 cursor-grab active:cursor-grabbing">
          <div className="pointer-events-none">{preview}</div>
        </div>
        <button
          type="button"
          className="m-2 shrink-0 cursor-pointer rounded px-1.5 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
          aria-label={`Remove ${item.title}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRemove}
        >
          ×
        </button>
      </div>
      <div className="flex shrink-0 justify-end p-1.5">
        <button
          type="button"
          className="flex h-6 w-6 cursor-nwse-resize items-end justify-end rounded-sm border border-zinc-300 bg-white shadow-sm"
          aria-label={`Resize ${item.title}`}
          data-testid={`dashboard-resize-${item.card}`}
          onPointerDown={onResizePointerDown}
        >
          <span className="pointer-events-none mb-0.5 mr-0.5 block h-2.5 w-2.5 border-b-2 border-r-2 border-zinc-500" />
        </button>
      </div>
    </article>
  );
}

function GridDrop({ className, children }: { className: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: GRID_ID });
  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? "bg-zinc-50" : ""}`}
      data-testid="dashboard-edit-grid"
    >
      {children}
    </div>
  );
}

function TrayCard({ item }: { item: Omit<DashboardEditorCard, "size" | "rows"> }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.card });
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`cursor-grab rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-left text-sm text-zinc-800 active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
      data-testid={`dashboard-tray-${item.card}`}
      {...attributes}
      {...listeners}
    >
      {item.title}
    </button>
  );
}

export function DashboardEditor({
  scopeKind,
  scope,
  returnHref,
  items,
  library,
  facilityDefaultBands = [],
  defaultAuthority,
  children,
}: {
  scopeKind: "FACILITY" | "DEPARTMENT" | "TEAM";
  scope: string;
  returnHref: string;
  items: readonly DashboardEditorCard[];
  library: readonly Omit<DashboardEditorCard, "size" | "rows">[];
  facilityDefaultBands?: readonly { authority: DashboardAuthority; label: string }[];
  defaultAuthority?: DashboardAuthority;
  children?: ReactNode;
}) {
  const [draft, setDraft] = useState<DashboardEditorCard[]>(() =>
    items.map((item) => ({ ...item, rows: cardRows(item.rows) })),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const live = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [saveState, saveAction, savePending] = useActionState<DashboardLayoutActionResult | null, FormData>(
    saveDashboardLayout,
    null,
  );
  const [resetState, resetAction, resetPending] = useActionState<DashboardLayoutActionResult | null, FormData>(
    resetDashboardLayout,
    null,
  );
  const [defaultState, defaultAction, defaultPending] = useActionState<DashboardLayoutActionResult | null, FormData>(
    setDashboardFacilityDefault,
    null,
  );
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (saveState?.ok || resetState?.ok) router.push(returnHref);
  }, [resetState, returnHref, router, saveState]);

  const previews = cardPreviews(children);
  const placed = new Set(draft.map((item) => item.card));
  const available = library.filter((item) => !placed.has(item.card));
  const groups = new Map<string, Omit<DashboardEditorCard, "size" | "rows">[]>();
  for (const item of available) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  const activeTitle =
    draft.find((item) => item.card === activeId)?.title ??
    available.find((item) => item.card === activeId)?.title ??
    "";

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const active = String(event.active.id);
    const over = event.over ? String(event.over.id) : null;
    const fromTray = available.find((item) => item.card === active);
    if (fromTray) {
      const card: DashboardEditorCard = { ...fromTray, size: defaultSize(fromTray.sizes), rows: 1 };
      if (!over || over === GRID_ID) {
        setDraft([...draft, card]);
        return;
      }
      const index = draft.findIndex((item) => item.card === over);
      if (index < 0) {
        setDraft([...draft, card]);
        return;
      }
      const next = [...draft];
      next.splice(index, 0, card);
      setDraft(next);
      return;
    }
    const dx = event.delta.x;
    const dy = event.delta.y;
    const sideways = Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy);
    if (sideways) {
      if (over && over !== active && over !== GRID_ID) {
        setDraft(placeBeside(draft, active, over, dx > 0 ? "right" : "left"));
        return;
      }
      setDraft(resizeWidth(draft, active, dx));
      return;
    }
    if (!over || active === over || over === GRID_ID) return;
    const from = draft.findIndex((item) => item.card === active);
    const to = draft.findIndex((item) => item.card === over);
    if (from < 0 || to < 0) return;
    setDraft(arrayMove(draft, from, to));
  }

  return (
    <div className="space-y-4" data-testid="dashboard-editor">
      <p className="text-sm text-zinc-600">
        Drag a card up or down to reorder it, or sideways to sit it next to another card. Drag the corner to change its width and height.
      </p>
      {live ? (
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={draft.map((item) => item.card)} strategy={rectSortingStrategy}>
          <GridDrop
            className={`dashboard-grid rounded-xl ${draft.length === 0 ? "min-h-36 border border-dashed border-zinc-300 p-4" : ""}`}
          >
            {draft.length === 0 ? (
              <p className="text-sm text-zinc-500" style={{ gridColumn: "1 / -1" }}>Drag a card here.</p>
            ) : (
              draft.map((item) => (
                <GridCard
                  key={item.card}
                  item={item}
                  preview={previews.get(item.card) ?? <h2 className="p-4 text-sm font-semibold text-zinc-900">{item.title}</h2>}
                  onResize={(size, rows) =>
                    setDraft(draft.map((entry) => (entry.card === item.card ? { ...entry, size, rows: cardRows(rows) } : entry)))
                  }
                  onRemove={() => setDraft(draft.filter((entry) => entry.card !== item.card))}
                  onMove={(direction) => {
                    const index = draft.findIndex((entry) => entry.card === item.card);
                    const next = index + direction;
                    if (index < 0 || next < 0 || next >= draft.length) return;
                    setDraft(arrayMove(draft, index, next));
                  }}
                />
              ))
            )}
          </GridDrop>
        </SortableContext>
        <DragOverlay>
          {activeId ? (
            <div className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold shadow-lg">
              {activeTitle}
            </div>
          ) : null}
        </DragOverlay>
        {available.length > 0 ? (
          <section className="space-y-3" data-testid="dashboard-new-cards">
            <h2 className="text-sm font-medium text-zinc-800">Cards</h2>
            {[...groups.entries()].map(([category, cards]) => (
              <div key={category}>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {CATEGORY_LABEL[category] ?? category}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {cards.map((card) => (
                    <TrayCard key={card.card} item={card} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </DndContext>
      ) : (
        <div
          className={`dashboard-grid rounded-xl ${draft.length === 0 ? "min-h-36 border border-dashed border-zinc-300 p-4" : ""}`}
          data-testid="dashboard-edit-grid"
        >
          {draft.map((item) => (
            <article
              key={item.card}
              style={{ gridRow: `span ${cardRows(item.rows)}`, minHeight: rowMinHeight(cardRows(item.rows)) }}
              className="relative min-w-0 rounded-xl border border-zinc-200 bg-white shadow-sm"
              data-testid={`dashboard-edit-card-${item.card}`}
              data-size={item.size}
              data-rows={String(cardRows(item.rows))}
            >
              {previews.get(item.card) ?? <h2 className="p-4 text-sm font-semibold text-zinc-900">{item.title}</h2>}
            </article>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <form action={saveAction}>
          <input type="hidden" name="scopeKind" value={scopeKind} />
          <input type="hidden" name="scope" value={scope} />
          <input
            type="hidden"
            name="items"
            value={JSON.stringify(draft.map((item) => ({ card: item.card, size: item.size, rows: item.rows })))}
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-60"
            disabled={savePending}
          >
            Save
          </button>
        </form>
        <form action={resetAction}>
          <input type="hidden" name="scopeKind" value={scopeKind} />
          <input type="hidden" name="scope" value={scope} />
          <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" disabled={resetPending}>
            Reset to default
          </button>
        </form>
        {facilityDefaultBands.length > 0 ? (
          <form action={defaultAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="scopeKind" value={scopeKind} />
            <input type="hidden" name="scope" value={scope} />
            <input
              type="hidden"
              name="items"
              value={JSON.stringify(draft.map((item) => ({ card: item.card, size: item.size, rows: item.rows })))}
            />
            <label className="flex items-center gap-2 text-sm text-zinc-800">
              Set as default for
              <select
                name="authority"
                defaultValue={
                  defaultAuthority && facilityDefaultBands.some((band) => band.authority === defaultAuthority)
                    ? defaultAuthority
                    : facilityDefaultBands[0]?.authority
                }
                className="rounded-md border border-zinc-300 px-2 py-1.5"
                data-testid="dashboard-default-band"
              >
                {facilityDefaultBands.map((band) => (
                  <option key={band.authority} value={band.authority}>
                    {band.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-60"
              disabled={defaultPending}
              data-testid="dashboard-set-default"
            >
              Set default
            </button>
          </form>
        ) : null}
        <a href={returnHref} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          Cancel
        </a>
      </div>
      {saveState && !saveState.ok ? (
        <p className="text-sm text-red-800" role="status">
          {saveState.message}
        </p>
      ) : null}
      {resetState && !resetState.ok ? (
        <p className="text-sm text-red-800" role="status">
          {resetState.message}
        </p>
      ) : null}
      {defaultState ? (
        <p className={`text-sm ${defaultState.ok ? "text-zinc-800" : "text-red-800"}`} role="status">
          {defaultState.message}
        </p>
      ) : null}
    </div>
  );
}

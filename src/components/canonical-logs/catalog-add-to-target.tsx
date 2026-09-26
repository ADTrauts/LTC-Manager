"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { assignCanonicalLogToTargetsAction } from "@/app/(protected)/build/logs/actions";
import {
  CATALOG_UNASSIGN_NOTICE,
  computeCatalogAssignDiff,
  type CatalogAssignKind,
  type CatalogAssignTargetRow,
  type CatalogAssignView,
} from "@/lib/canonical-logs/catalog-assign";

type Props = {
  view: CatalogAssignView;
};

const KIND_ORDER: CatalogAssignKind[] = [
  "SPACE",
  "ASSET",
  "UNIT",
  "DEPARTMENT",
  "OPERATIONAL_TYPE",
];

export function CatalogAddToTarget({ view }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CatalogAssignKind>("SPACE");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => initialSelected(view));
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirmRemove(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const liveAssignments = useMemo(
    () =>
      view.categories.flatMap((c) =>
        c.targets
          .filter((t) => t.assigned && t.attachmentId)
          .map((t) => ({ key: t.key, attachmentId: t.attachmentId! })),
      ),
    [view],
  );

  const category = view.categories.find((c) => c.kind === kind) ?? view.categories[0]!;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? category.targets.filter((t) =>
          `${t.label} ${t.groupLabel ?? ""} ${t.departmentName ?? ""}`.toLowerCase().includes(q),
        )
      : category.targets;
    return [...rows].sort((a, b) => {
      if (a.suggested !== b.suggested) return a.suggested ? -1 : 1;
      if (a.assigned !== b.assigned) return a.assigned ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  }, [category.targets, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogAssignTargetRow[]>();
    for (const row of filtered) {
      const group = row.groupLabel ?? "";
      const list = map.get(group) ?? [];
      list.push(row);
      map.set(group, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const diff = computeCatalogAssignDiff({
    selectedKeys: [...selected],
    liveAssignments,
  });

  function toggle(row: CatalogAssignTargetRow) {
    if (row.disabled && !row.assigned) return;
    setConfirmRemove(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.key)) next.delete(row.key);
      else next.add(row.key);
      return next;
    });
  }

  function selectSuggested() {
    setConfirmRemove(false);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of category.targets) {
        if (row.suggested && !row.disabled) next.add(row.key);
      }
      return next;
    });
  }

  function save() {
    if (diff.remove.length > 0 && !confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await assignCanonicalLogToTargetsAction({
        catalogStableKey: view.catalogStableKey,
        selectedKeys: [...selected],
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(result.message);
      setConfirmRemove(false);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <section id="add-to" className="space-y-2" data-testid="catalog-add-to-form">
      {notice ? (
        <p
          className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800"
          role="status"
          data-testid="catalog-assign-notice"
        >
          {notice}
        </p>
      ) : null}
      <div className="rounded-md border border-zinc-200 bg-white p-3">
        <h2 className="text-sm font-semibold text-zinc-900">
          Place on rooms, assets, units, or departments
        </h2>
        <p className="text-xs text-zinc-500">
          {view.recommendedCadenceLabel}
          {view.timingSummary ? ` · ${view.timingSummary}` : ""}
          {view.usingRecommendedSchedule ? " · Using recommended schedule" : ""}
        </p>
        <p className="mt-1 text-xs text-zinc-500">{view.effectiveLabel}</p>
        <button
          type="button"
          onClick={() => {
            setSelected(initialSelected(view));
            setConfirmRemove(false);
            setError(null);
            setOpen(true);
          }}
          className="mt-3 inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white"
          data-testid="open-catalog-assign"
        >
          Assign…
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-center bg-zinc-950/50 p-3 sm:items-center sm:p-6"
          role="presentation"
          onClick={() => {
            setOpen(false);
            setConfirmRemove(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-assign-title"
            data-testid="catalog-assign-dialog"
            className="flex max-h-[min(44rem,100%)] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="border-b border-zinc-200 px-4 py-3">
              <h2 id="catalog-assign-title" className="text-base font-semibold text-zinc-900">
                Assign {view.catalogName}
              </h2>
              <p className="text-xs text-zinc-600">
                {view.recommendedCadenceLabel}
                {view.timingSummary ? ` · ${view.timingSummary}` : ""}
              </p>
              {kind === "OPERATIONAL_TYPE" ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Operational Types are department program classes. This is not Physical Room Type.
                </p>
              ) : null}
              {view.usingRecommendedSchedule ? (
                <p className="text-xs font-medium text-zinc-700">Using recommended schedule</p>
              ) : null}
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <nav
                className="flex gap-1 overflow-x-auto border-b border-zinc-200 p-2 sm:flex-col sm:border-b-0 sm:border-r"
                aria-label="Target type"
              >
                {KIND_ORDER.filter((item) => view.categories.some((c) => c.kind === item)).map((item) => {
                  const cat = view.categories.find((c) => c.kind === item)!;
                  const assignedCount = cat.targets.filter((t) => selected.has(t.key)).length;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setKind(item);
                        setSearch("");
                      }}
                      className={`min-h-9 rounded-md px-3 text-left text-sm ${
                        kind === item
                          ? "bg-zinc-900 font-medium text-white"
                          : "text-zinc-800 hover:bg-zinc-100"
                      }`}
                    >
                      {cat.label}
                      <span className="block text-[11px] opacity-80">{assignedCount} selected</span>
                    </button>
                  );
                })}
              </nav>

              <div className="flex min-h-0 flex-col">
                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-2">
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Search ${category.label.toLowerCase()}`}
                    className="min-h-9 min-w-[12rem] flex-1 rounded-md border border-zinc-300 px-3 text-sm"
                    aria-label={`Search ${category.label}`}
                  />
                  <button
                    type="button"
                    onClick={selectSuggested}
                    className="min-h-9 text-xs font-medium text-zinc-800 underline underline-offset-2"
                  >
                    Select suggested
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1">
                  {grouped.length === 0 ? (
                    <p className="text-sm text-zinc-600">No {category.label.toLowerCase()} match.</p>
                  ) : (
                    grouped.map(([group, rows]) => (
                      <div key={group || "all"} className="mb-2">
                        {group ? (
                          <p className="sticky top-0 bg-white py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                            {group}
                          </p>
                        ) : null}
                        <ul>
                          {rows.map((row) => {
                            const checked = selected.has(row.key);
                            const locked = row.disabled && !row.assigned;
                            return (
                              <li key={row.key}>
                                <label
                                  className={`flex min-h-8 items-center gap-2 py-0.5 text-sm ${
                                    locked ? "cursor-not-allowed text-zinc-400" : "text-zinc-900"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 shrink-0"
                                    checked={checked}
                                    disabled={locked}
                                    onChange={() => toggle(row)}
                                    aria-label={row.label}
                                  />
                                  <span className="min-w-0 leading-snug">
                                    <span className="font-medium">{row.label}</span>
                                    {row.assigned || row.suggested || row.disabledReason ? (
                                      <span className="ml-1 text-[11px] font-normal text-zinc-500">
                                        {row.assigned ? "Assigned" : null}
                                        {row.assigned && row.suggested ? " · " : null}
                                        {row.suggested ? "Suggested" : null}
                                      </span>
                                    ) : null}
                                    {row.disabledReason && !row.assigned ? (
                                      <span className="ml-1 text-[11px] text-amber-800">
                                        {row.disabledReason}
                                      </span>
                                    ) : null}
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <footer className="space-y-2 border-t border-zinc-200 px-4 py-3">
              {error ? (
                <p className="text-sm text-red-700" role="alert">
                  {error}
                </p>
              ) : null}
              <p className="text-xs text-zinc-600">
                {diff.addKeys.length} will be added · {diff.remove.length} will be removed
              </p>
              {confirmRemove ? (
                <p className="text-sm text-zinc-800" data-testid="catalog-unassign-copy" role="status">
                  {CATALOG_UNASSIGN_NOTICE}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setConfirmRemove(false);
                  }}
                  className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-3 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending || (diff.addKeys.length === 0 && diff.remove.length === 0)}
                  onClick={save}
                  className="inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-50"
                  data-testid="catalog-assign-save"
                >
                  {pending ? "Saving…" : confirmRemove ? "Confirm assign" : "Assign"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function initialSelected(view: CatalogAssignView): Set<string> {
  return new Set(
    view.categories.flatMap((c) => c.targets.filter((t) => t.assigned).map((t) => t.key)),
  );
}

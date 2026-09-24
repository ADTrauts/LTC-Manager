"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { CatalogBrowseCard, CatalogBrowseFilterGroup } from "@/lib/canonical-logs/catalog-browse";
import { catalogBrowseFilterGroupLabel } from "@/lib/canonical-logs/catalog-browse";
import type { CatalogLogPurposeType } from "@prisma/client";

type Props = {
  cards: CatalogBrowseCard[];
  /** When set, cards marked suggested float first and show a gentle badge. */
  suggestedStableKeys?: readonly string[];
  /**
   * Prefix for detail links; stableKey is appended (e.g. `/build/logs/catalog/`).
   * Must be a string — functions cannot cross the Server → Client Component boundary.
   */
  detailHrefPrefix: string;
  /**
   * Optional attach CTA prefix when already in a target context; stableKey is appended.
   * Prefer a full path template ending before the key, or include query start like
   * `/build/logs/attach?catalogStableKey=`.
   */
  attachHrefPrefix?: string;
  emptyMessage?: string;
};

const BROWSE_GROUPS: CatalogBrowseFilterGroup[] = [
  "ALL",
  "EQUIPMENT",
  "FOOD_SAFETY",
  "CLEANING_SANITATION",
  "GENERAL_OPERATIONS",
];

const PURPOSES: Array<CatalogLogPurposeType | "ALL"> = ["ALL", "LOG", "CHECKLIST"];

export function CatalogBrowseClient({
  cards,
  suggestedStableKeys = [],
  detailHrefPrefix,
  attachHrefPrefix,
  emptyMessage = "No Catalog Logs are published yet. Apply Catalog seeds or publish definitions.",
}: Props) {
  const [search, setSearch] = useState("");
  const [browseGroup, setBrowseGroup] = useState<CatalogBrowseFilterGroup>("ALL");
  const [purpose, setPurpose] = useState<CatalogLogPurposeType | "ALL">("ALL");
  const [view, setView] = useState<"cards" | "list">("cards");
  const suggested = useMemo(() => new Set(suggestedStableKeys), [suggestedStableKeys]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = cards.filter((c) => {
      if (browseGroup !== "ALL") {
        if (browseGroup === "EQUIPMENT" && c.category !== "EQUIPMENT") return false;
        if (
          browseGroup === "FOOD_SAFETY" &&
          c.category !== "FOOD_SAFETY" &&
          c.category !== "TEMPERATURE"
        ) {
          return false;
        }
        if (
          browseGroup === "CLEANING_SANITATION" &&
          c.category !== "CLEANING" &&
          c.category !== "SANITATION"
        ) {
          return false;
        }
        if (
          browseGroup === "GENERAL_OPERATIONS" &&
          c.category !== "OPENING_CLOSING" &&
          c.category !== "COMPLIANCE" &&
          c.category !== "OTHER"
        ) {
          return false;
        }
      }
      if (purpose !== "ALL" && c.purposeType !== purpose) return false;
      if (!q) return true;
      const hay =
        `${c.name} ${c.description} ${c.categoryLabel} ${c.fieldSummary} ${c.suggestedForLabels.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
    return [...rows].sort((a, b) => {
      const as = suggested.has(a.stableKey) ? 0 : 1;
      const bs = suggested.has(b.stableKey) ? 0 : 1;
      if (as !== bs) return as - bs;
      return a.name.localeCompare(b.name);
    });
  }, [cards, search, browseGroup, purpose, suggested]);

  if (cards.length === 0) {
    return (
      <div
        className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950"
        data-testid="catalog-empty"
        role="status"
      >
        <p className="font-medium">Catalog unavailable</p>
        <p className="mt-1 text-xs">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="catalog-browse">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600">
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Catalog Logs"
            className="min-h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
            data-testid="catalog-search"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Category
          <select
            value={browseGroup}
            onChange={(e) => setBrowseGroup(e.target.value as CatalogBrowseFilterGroup)}
            className="min-h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm"
            data-testid="catalog-filter-category"
          >
            {BROWSE_GROUPS.map((c) => (
              <option key={c} value={c}>
                {catalogBrowseFilterGroupLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Purpose
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as CatalogLogPurposeType | "ALL")}
            className="min-h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm"
            data-testid="catalog-filter-purpose"
          >
            {PURPOSES.map((p) => (
              <option key={p} value={p}>
                {p === "ALL" ? "All purposes" : p === "CHECKLIST" ? "Checklist" : "Log"}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1" role="group" aria-label="Catalog layout">
          <button
            type="button"
            onClick={() => setView("cards")}
            className={`min-h-10 rounded-md px-3 text-xs font-medium ${
              view === "cards" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-800"
            }`}
            data-testid="catalog-view-cards"
          >
            Cards
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`min-h-10 rounded-md px-3 text-xs font-medium ${
              view === "list" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-800"
            }`}
            data-testid="catalog-view-list"
          >
            List
          </button>
        </div>
      </div>

      <ul
        className={
          view === "cards"
            ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            : "divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white"
        }
        role="list"
      >
        {filtered.map((card) => {
          const isSuggested = suggested.has(card.stableKey);
          return (
            <li
              key={card.id}
              className={
                view === "cards"
                  ? "flex flex-col justify-between gap-3 rounded-md border border-zinc-200 bg-white p-3"
                  : "flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
              }
              data-testid="catalog-card"
              data-stable-key={card.stableKey}
              data-suggested={isSuggested ? "true" : "false"}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h3 className="text-sm font-semibold text-zinc-900">{card.name}</h3>
                  <span className="text-xs text-zinc-500">{card.purposeLabel}</span>
                </div>
                <p className="text-xs leading-snug text-zinc-600">{card.description}</p>
                {card.fieldSummary ? (
                  <p className="text-xs text-zinc-600">{card.fieldSummary}</p>
                ) : null}
                <p className="text-xs text-zinc-700">
                  Recommended: <span className="font-medium">{card.recommendedCadenceLabel}</span>
                </p>
                {card.suggestedForLabels.length > 0 ? (
                  <p className="text-xs text-zinc-500">
                    Suggested for: {card.suggestedForLabels.join(" · ")}
                  </p>
                ) : null}
                {isSuggested ? (
                  <p className="text-xs font-medium text-zinc-800" data-testid="catalog-suggested-badge">
                    Suggested for this asset
                  </p>
                ) : null}
                <p className="text-[11px] text-zinc-400">
                  Version {card.version} · LTC Corp maintained
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  href={`${detailHrefPrefix}${card.stableKey}`}
                  className="inline-flex min-h-9 items-center rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  View details
                </Link>
                {attachHrefPrefix ? (
                  <Link
                    href={`${attachHrefPrefix}${card.stableKey}`}
                    className="inline-flex min-h-9 items-center rounded-md border border-zinc-900 bg-zinc-900 px-2.5 text-xs font-medium text-white hover:bg-zinc-800"
                    data-testid="catalog-add-to-target"
                  >
                    Add to this target
                  </Link>
                ) : (
                  <Link
                    href={`/build/logs/catalog/${card.stableKey}#add-to`}
                    className="inline-flex min-h-9 items-center rounded-md border border-zinc-900 bg-zinc-900 px-2.5 text-xs font-medium text-white hover:bg-zinc-800"
                    data-testid="catalog-add-to"
                  >
                    Add to…
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500" role="status">
          No Catalog Logs match these filters.
        </p>
      ) : null}
    </div>
  );
}

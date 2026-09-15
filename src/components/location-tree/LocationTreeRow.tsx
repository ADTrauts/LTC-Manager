"use client";

import { Building2, ChevronDown, ChevronRight, DoorOpen, LayoutGrid } from "lucide-react";
import type { ReactNode } from "react";

import {
  LOCATION_TREE_COUNT_PILL_CLASS,
  locationTreePaddingLeft,
  type LocationTreeKind,
} from "./location-tree-tokens";

export type LocationTreeRowProps = {
  kind: LocationTreeKind;
  depth: number;
  label: string;
  /** Optional secondary metadata (e.g. Facility Room Type). */
  meta?: string | null;
  count?: number | null;
  countTitle?: string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  trailing?: ReactNode;
  "data-testid"?: string;
  inactive?: boolean;
};

/**
 * Presentational hierarchy row — Facility Builder Structure visual grammar.
 * No DnD, create, rename, or selection editor. Used by Department Locations
 * (and available for Facility Builder to adopt later without behavior coupling).
 */
export function LocationTreeRow({
  kind,
  depth,
  label,
  meta,
  count,
  countTitle,
  expandable = false,
  expanded = false,
  onToggle,
  trailing,
  "data-testid": dataTestId,
  inactive = false,
}: LocationTreeRowProps) {
  const isFloor = kind === "floor";
  const isRoom = kind === "room";

  return (
    <div
      className={`group flex min-w-0 items-center rounded-md border-l-2 border-l-transparent transition-colors hover:bg-zinc-50 ${
        isFloor ? "mt-1 font-medium text-zinc-900" : isRoom ? "text-zinc-700" : "text-zinc-800"
      }`}
      style={{ paddingLeft: locationTreePaddingLeft(depth) }}
      data-testid={dataTestId}
      data-tree-kind={kind}
    >
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 p-0.5 text-zinc-400 transition-transform"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      ) : (
        <span className="inline-block w-5 shrink-0" aria-hidden />
      )}

      <span className="mr-2 shrink-0 text-zinc-400">
        {kind === "floor" ? (
          <Building2 className="h-4 w-4" aria-hidden />
        ) : kind === "neighborhood" ? (
          <LayoutGrid className="h-4 w-4" aria-hidden />
        ) : (
          <DoorOpen className="h-4 w-4" aria-hidden />
        )}
      </span>

      <div className="min-w-0 flex-1 py-2">
        <p
          className={`truncate text-sm ${
            isFloor ? "font-semibold" : "font-medium"
          } ${inactive ? "opacity-40 line-through" : ""}`}
        >
          {label}
        </p>
        {meta ? (
          <p className="truncate text-xs text-zinc-500 sm:hidden">{meta}</p>
        ) : null}
      </div>

      {meta ? (
        <span className="mr-2 hidden max-w-[9rem] shrink-0 truncate text-xs text-zinc-500 sm:inline">
          {meta}
        </span>
      ) : null}

      {count != null && count > 0 ? (
        <span className={LOCATION_TREE_COUNT_PILL_CLASS} title={countTitle}>
          {count}
        </span>
      ) : null}

      {trailing}
    </div>
  );
}

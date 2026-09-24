"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  AppIcons,
  locationIconClassName,
  resolveLocationIcon,
} from "@/lib/design-system";
import { useNavSearchParams } from "@/hooks/use-nav-pathname";
import type { ProjectedSidebarNode, ProjectedSidebarSection } from "@/lib/locations";
import { NAV_ZONE_LABELS } from "@/lib/nav-zones";
import { isActiveLocationHref, isActiveNavPath } from "@/lib/nav-utils";
import type { SidebarUnit } from "@/lib/units";

type LeftSidebarProps = {
  /** Legacy flat units — used only when Projection Sidebar flag is off. */
  units?: SidebarUnit[];
  /** Projection tree sections — exclusive with legacy units when flag on. */
  projectionSections?: readonly ProjectedSidebarSection[];
  projectionUnavailable?: boolean;
  lockedUnitId?: string;
  /**
   * rail — persistent desktop aside (default).
   * panel — content only for compact shell drawer (no aside chrome).
   */
  presentation?: "rail" | "panel";
  /** Called when an actionable location link is activated (close compact drawer). */
  onNavigate?: () => void;
};

function sidebarLinkClass(isActive: boolean, disabled = false, panel = false) {
  if (disabled) {
    return `flex min-h-11 items-center gap-2.5 px-3 py-2 text-sm text-zinc-400 ${
      panel ? "" : "rounded-md"
    }`;
  }
  return isActive
    ? `app-accent-active flex min-h-11 items-center gap-2.5 px-3 py-2 text-sm font-medium text-white ${
        panel ? "" : "rounded-md"
      }`
    : `flex min-h-11 items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 ${
        panel ? "" : "rounded-md"
      }`;
}

function structuralClass(panel: boolean, depth: number) {
  if (panel && depth === 0) {
    return "flex min-h-11 w-full items-center gap-2 bg-zinc-100/80 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-zinc-600";
  }
  return `flex min-h-9 w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 hover:bg-zinc-50 ${
    panel ? "" : "rounded-md"
  }`;
}

function SidebarProjectedNode({
  node,
  depth,
  lockedUnitId,
  pathname,
  search,
  onNavigate,
  panel,
}: {
  node: ProjectedSidebarNode;
  depth: number;
  lockedUnitId?: string;
  pathname: string;
  search: string;
  onNavigate?: () => void;
  panel: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const pad = !panel && depth > 0 ? { paddingLeft: `${12 + depth * 12}px` } : undefined;
  const unitId = node.unitId;
  const isLockedOut = Boolean(lockedUnitId && unitId && unitId !== lockedUnitId);
  const LocationIcon = AppIcons.locations;
  const ChevronIcon = AppIcons.chevronDown;
  const hasChildren = node.children.length > 0;

  const expandControl = hasChildren ? (
    <button
      type="button"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
      aria-expanded={expanded}
      aria-label={expanded ? `Collapse ${node.label}` : `Expand ${node.label}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setExpanded((value) => !value);
      }}
    >
      <ChevronIcon
        className={`h-3.5 w-3.5 transition-transform ${expanded ? "" : "-rotate-90"}`}
        aria-hidden
      />
    </button>
  ) : (
    <span className="inline-block w-6 shrink-0" aria-hidden />
  );

  const children =
    hasChildren && expanded
      ? node.children.map((child) => (
          <SidebarProjectedNode
            key={child.id}
            node={child}
            depth={depth + 1}
            lockedUnitId={lockedUnitId}
            pathname={pathname}
            search={search}
            onNavigate={onNavigate}
            panel={panel}
          />
        ))
      : null;
  const nestedChildren = children ? (
    <div
      className={
        panel
          ? depth === 0
            ? "border-t border-zinc-200 bg-white py-1"
            : "ml-7 border-l-2 border-zinc-200 py-0.5 pl-2"
          : ""
      }
    >
      {children}
    </div>
  ) : null;

  if (node.presentation === "STRUCTURAL" || !node.href) {
    return (
      <div>
        <div
          className={structuralClass(panel, depth)}
          style={pad}
          data-presentation="STRUCTURAL"
          data-location-id={node.id}
          data-kind={node.kind}
        >
          {expandControl}
          <span className="truncate">
            {node.label}
            {node.levelLabel ? (
              <span className="sr-only"> ({node.levelLabel})</span>
            ) : null}
          </span>
        </div>
        {nestedChildren}
      </div>
    );
  }

  const isActive = isActiveLocationHref(pathname, search, node.href);

  const labelBody = (
    <>
      {expandControl}
      <LocationIcon
        className={locationIconClassName(isActive, isLockedOut)}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">
        {node.label}
        {node.levelLabel ? (
          <span className="sr-only"> ({node.levelLabel})</span>
        ) : null}
      </span>
    </>
  );

  return (
    <div>
      {isLockedOut ? (
        <span
          aria-disabled="true"
          className={sidebarLinkClass(false, true, panel)}
          style={pad}
          title="This tablet is locked to another unit"
          data-presentation="ACTIONABLE"
          data-location-id={node.id}
          data-kind={node.kind}
        >
          {labelBody}
        </span>
      ) : (
        <Link
          href={node.href}
          className={sidebarLinkClass(isActive, false, panel)}
          style={pad}
          data-presentation="ACTIONABLE"
          data-location-id={node.id}
          data-kind={node.kind}
          onClick={() => onNavigate?.()}
        >
          {labelBody}
        </Link>
      )}
      {nestedChildren}
    </div>
  );
}

function countNodes(sections: readonly ProjectedSidebarSection[]): number {
  let n = 0;
  const walk = (nodes: readonly ProjectedSidebarNode[]) => {
    for (const node of nodes) {
      n += 1;
      walk(node.children);
    }
  };
  for (const section of sections) walk(section.nodes);
  return n;
}

export function LeftSidebar({
  units = [],
  projectionSections,
  projectionUnavailable = false,
  lockedUnitId,
  presentation = "rail",
  onNavigate,
}: LeftSidebarProps) {
  const pathname = usePathname();
  const searchParams = useNavSearchParams();
  const search = searchParams?.toString() ?? "";
  const useProjection = projectionSections != null;

  const body = (
    <div className={presentation === "panel" ? "flex flex-col gap-4" : "flex flex-col gap-6 p-4 lg:px-4 lg:py-5"}>
      <section aria-label="Service points">
        {presentation === "rail" ? (
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {NAV_ZONE_LABELS.LOCATIONS}
          </h2>
        ) : null}
        <div className="space-y-0.5">
          {useProjection ? (
            <>
              {projectionUnavailable ? (
                <p className="px-3 py-2 text-sm text-zinc-500" role="status">
                  Locations temporarily unavailable.
                </p>
              ) : null}
              {projectionSections.map((section, sectionIndex) => (
                <div
                  key={section.departmentKey ?? `section-${sectionIndex}`}
                  className={
                    presentation === "panel"
                      ? "overflow-hidden rounded-lg border border-zinc-200 bg-white"
                      : "space-y-0.5"
                  }
                >
                  {section.label ? (
                    <h3
                      className={
                        presentation === "panel"
                          ? "border-b border-zinc-300 bg-zinc-900 px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white"
                          : "mb-1 mt-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
                      }
                    >
                      {section.label}
                    </h3>
                  ) : null}
                  <div className={presentation === "panel" ? "divide-y divide-zinc-300" : ""}>
                    {section.nodes.map((node) => (
                      <SidebarProjectedNode
                        key={node.id}
                        node={node}
                        depth={0}
                        lockedUnitId={lockedUnitId}
                        pathname={pathname}
                        search={search}
                        onNavigate={onNavigate}
                        panel={presentation === "panel"}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {!projectionUnavailable && countNodes(projectionSections) === 0 ? (
                <p className="px-3 py-2 text-sm text-zinc-500">No assigned locations.</p>
              ) : null}
            </>
          ) : (
            <>
              {units.map((unit) => {
                const href = `/unit/${unit.id}`;
                const isDisabled = Boolean(lockedUnitId && unit.id !== lockedUnitId);
                const isActive = isActiveNavPath(pathname, href);
                const LocationIcon = resolveLocationIcon(unit);
                const label = (
                  <>
                    <LocationIcon
                      className={locationIconClassName(isActive, isDisabled)}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate" title={unit.name}>
                      {unit.name}
                    </span>
                  </>
                );
                return isDisabled ? (
                  <span
                    key={unit.id}
                    aria-disabled="true"
                    className={sidebarLinkClass(false, true)}
                    title="This tablet is locked to another unit"
                  >
                    {label}
                  </span>
                ) : (
                  <Link
                    key={unit.id}
                    href={href}
                    className={sidebarLinkClass(isActive)}
                    onClick={() => onNavigate?.()}
                  >
                    {label}
                  </Link>
                );
              })}
              {units.length === 0 ? (
                <p className="px-3 py-2 text-sm text-zinc-500">No assigned locations.</p>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );

  if (presentation === "panel") {
    return <div data-testid="locations-nav-panel">{body}</div>;
  }

  return (
    <aside
      className="hidden w-72 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white xl:block xl:min-h-0"
      aria-label="Locations rail"
      data-testid="locations-rail"
      data-shell-region="sidebar"
    >
      {body}
    </aside>
  );
}

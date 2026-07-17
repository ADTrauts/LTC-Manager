"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ReadinessChip } from "@/components/readiness-chip";
import {
  AppIcons,
  locationIconClassName,
  navIconClassName,
  resolveLocationIcon,
} from "@/lib/design-system";
import type { ProjectedSidebarNode, ProjectedSidebarSection } from "@/lib/locations";
import { NAV_ZONE_LABELS } from "@/lib/nav-zones";
import { isActiveNavPath } from "@/lib/nav-utils";
import type { ReadinessState } from "@/lib/readiness";
import type { SidebarUnit } from "@/lib/units";

type LeftSidebarProps = {
  /** Legacy flat units — used only when Projection Sidebar flag is off. */
  units?: SidebarUnit[];
  /** Projection tree sections — exclusive with legacy units when flag on. */
  projectionSections?: readonly ProjectedSidebarSection[];
  projectionUnavailable?: boolean;
  lockedUnitId?: string;
  /** Supervisor+ user sessions see the Operations Center entry; floor PIN sessions do not. */
  showOperationsCenterLink?: boolean;
  readinessByUnitId?: Record<string, { state: ReadinessState }>;
};

function sidebarLinkClass(isActive: boolean, disabled = false) {
  if (disabled) {
    return "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm text-zinc-400";
  }
  return isActive
    ? "app-accent-active flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-white"
    : "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900";
}

function structuralClass() {
  return "flex min-h-9 w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 hover:bg-zinc-50";
}

function hrefPathOnly(href: string): string {
  return href.split("?")[0] ?? href;
}

function SidebarProjectedNode({
  node,
  depth,
  lockedUnitId,
  readinessByUnitId,
  pathname,
}: {
  node: ProjectedSidebarNode;
  depth: number;
  lockedUnitId?: string;
  readinessByUnitId: Record<string, { state: ReadinessState }>;
  pathname: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const pad = depth > 0 ? { paddingLeft: `${12 + depth * 12}px` } : undefined;
  const unitId = node.unitId;
  const isLockedOut = Boolean(lockedUnitId && unitId && unitId !== lockedUnitId);
  const readiness = unitId ? readinessByUnitId[unitId] : undefined;
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
            readinessByUnitId={readinessByUnitId}
            pathname={pathname}
          />
        ))
      : null;

  if (node.presentation === "STRUCTURAL" || !node.href) {
    return (
      <div>
        <div
          className={structuralClass()}
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
        {children}
      </div>
    );
  }

  const pathOnly = hrefPathOnly(node.href);
  const isActive = isActiveNavPath(pathname, pathOnly);

  const labelBody = (
    <>
      {expandControl}
      <LocationIcon
        className={locationIconClassName(isActive, isLockedOut)}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="truncate">
          {node.label}
          {node.levelLabel ? (
            <span className="sr-only"> ({node.levelLabel})</span>
          ) : null}
        </span>
        {readiness ? (
          <ReadinessChip state={readiness.state} className="shrink-0" />
        ) : null}
      </span>
    </>
  );

  return (
    <div>
      {isLockedOut ? (
        <span
          aria-disabled="true"
          className={sidebarLinkClass(false, true)}
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
          className={sidebarLinkClass(isActive)}
          style={pad}
          data-presentation="ACTIONABLE"
          data-location-id={node.id}
          data-kind={node.kind}
        >
          {labelBody}
        </Link>
      )}
      {children}
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
  showOperationsCenterLink = true,
  readinessByUnitId = {},
}: LeftSidebarProps) {
  const pathname = usePathname();
  const operationsCenterLabel = NAV_ZONE_LABELS.OPERATIONS_CENTER;
  const OperationsIcon = AppIcons.operationsCenter;
  const dashboardActive = isActiveNavPath(pathname, "/dashboard");
  const useProjection = projectionSections != null;

  return (
    <aside
      className="w-full shrink-0 border-r border-zinc-200 bg-white lg:min-h-0 lg:w-72 lg:overflow-y-auto"
      aria-label="Locations rail"
    >
      <div className="flex flex-col gap-6 p-4 lg:px-4 lg:py-5">
        {showOperationsCenterLink ? (
          <section aria-label={operationsCenterLabel}>
            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
              {operationsCenterLabel}
            </h2>
            <div className="space-y-0.5">
              <Link href="/dashboard" className={sidebarLinkClass(dashboardActive)}>
                <OperationsIcon className={navIconClassName(dashboardActive)} aria-hidden />
                <span className="truncate">{operationsCenterLabel}</span>
              </Link>
            </div>
          </section>
        ) : null}

        <section aria-label="Service points">
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            {NAV_ZONE_LABELS.LOCATIONS}
          </h2>
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
                    className="space-y-0.5"
                  >
                    {section.label ? (
                      <h3 className="mb-1 mt-2 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
                        {section.label}
                      </h3>
                    ) : null}
                    {section.nodes.map((node) => (
                      <SidebarProjectedNode
                        key={node.id}
                        node={node}
                        depth={0}
                        lockedUnitId={lockedUnitId}
                        readinessByUnitId={readinessByUnitId}
                        pathname={pathname}
                      />
                    ))}
                  </div>
                ))}
                {!projectionUnavailable && countNodes(projectionSections) === 0 ? (
                  <p className="px-3 py-2 text-sm text-zinc-500">No active locations.</p>
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
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="truncate">{unit.name}</span>
                        {readinessByUnitId[unit.id] ? (
                          <ReadinessChip
                            state={readinessByUnitId[unit.id]!.state}
                            className="shrink-0"
                          />
                        ) : null}
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
                    <Link key={unit.id} href={href} className={sidebarLinkClass(isActive)}>
                      {label}
                    </Link>
                  );
                })}
                {units.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-zinc-500">No active locations.</p>
                ) : null}
              </>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}

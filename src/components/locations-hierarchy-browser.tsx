"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import {
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@/components/design-system";
import { AppIcons } from "@/lib/design-system";
import type { FacilityVocabulary } from "@/lib/facility-builder/facility-vocabulary";
import type {
  LocationLandingRowState,
  LocationsDepartmentSnapshot,
  LocationsTreeNode,
  LocationsViewModel,
} from "@/lib/locations";

export type LocationsHierarchyBrowserProps = {
  view: LocationsViewModel;
  vocabulary: FacilityVocabulary;
  projectionError: string | null;
  canConfigureFacility: boolean;
  lensSummary: string | null;
  landingByNodeId?: Readonly<Record<string, LocationLandingRowState>>;
};

function kindLabel(
  kind: LocationsTreeNode["kind"],
  vocabulary: FacilityVocabulary,
): string | null {
  switch (kind) {
    case "BUILDING":
      return vocabulary.level0.singular;
    case "FLOOR":
      return vocabulary.level1.singular;
    case "NEIGHBORHOOD":
      return vocabulary.level2.singular;
    case "ROOM":
      return vocabulary.level3.singular;
    case "LEGACY":
      return "Location";
    default:
      return null;
  }
}

function HierarchyNode({
  node,
  vocabulary,
  depth,
  landingByNodeId,
}: {
  node: LocationsTreeNode;
  vocabulary: FacilityVocabulary;
  depth: number;
  landingByNodeId: Readonly<Record<string, LocationLandingRowState>>;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const level = kindLabel(node.kind, vocabulary);
  const landing = landingByNodeId[node.id];
  const ChevronIcon = AppIcons.chevronDown;
  const LocationIcon = AppIcons.locations;

  if (node.kind === "FACILITY") {
    return (
      <>
        {node.children.map((child) => (
          <HierarchyNode
            key={child.id}
            node={child}
            vocabulary={vocabulary}
            depth={depth}
            landingByNodeId={landingByNodeId}
          />
        ))}
      </>
    );
  }

  const isRoot = depth === 0;
  const needsAttention = Boolean(landing?.needsAttention);
  const rowTone = needsAttention
    ? isRoot
      ? "bg-amber-50/70 px-3 py-3 sm:px-4"
      : "border-l-2 border-amber-400 bg-amber-50/50 px-3 py-2.5 sm:px-4"
    : isRoot
      ? "bg-zinc-100/80 px-3 py-3 sm:px-4"
      : depth === 1
        ? "px-3 py-2.5 hover:bg-zinc-50 sm:px-4"
        : "px-3 py-2 hover:bg-zinc-50";

  return (
    <li
      className="list-none"
      data-location-id={node.id}
      data-kind={node.kind}
      data-landing-grain={landing?.grain}
      data-needs-attention={needsAttention ? "true" : "false"}
      data-testid="location-landing-row"
      style={
        isRoot
          ? {
              overflow: "hidden",
              borderRadius: "1rem",
              border: "1px solid #e4e4e7",
              backgroundColor: "#ffffff",
            }
          : undefined
      }
    >
      <div className={`flex min-h-11 flex-wrap items-start gap-2 transition-colors ${rowTone}`}>
        {hasChildren ? (
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-white hover:text-zinc-900"
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${node.label}` : `Expand ${node.label}`}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronIcon
              className={`h-4 w-4 transition-transform ${expanded ? "" : "-rotate-90"}`}
              aria-hidden
            />
          </button>
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center">
            <LocationIcon className="h-4 w-4 text-zinc-400" aria-hidden />
          </span>
        )}

        <div className="min-w-0 flex-1 py-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {node.href ? (
              <Link
                href={node.href}
                className="min-h-11 inline-flex items-center text-sm font-semibold text-zinc-900 hover:underline"
              >
                {node.label}
              </Link>
            ) : (
              <span
                className={
                  node.presentation === "STRUCTURAL"
                    ? "inline-flex min-h-11 items-center text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500"
                    : "inline-flex min-h-11 items-center text-sm font-medium text-zinc-900"
                }
              >
                {node.label}
              </span>
            )}
            {level ? (
              <StatusBadge variant="neutral">{level}</StatusBadge>
            ) : null}
            {node.presentation === "STRUCTURAL" ? (
              <StatusBadge variant="neutral">Structural</StatusBadge>
            ) : null}
          </div>

          {landing ? (
            <div className="mt-1 space-y-0.5 text-sm text-zinc-600" data-testid="location-landing-state">
              {landing.configurationLabel ? (
                <p className="text-zinc-700" data-testid="location-landing-configuration">
                  {landing.configurationLabel}
                </p>
              ) : null}
              {landing.operationLabel ? (
                <p data-testid="location-landing-operation">{landing.operationLabel}</p>
              ) : null}
              {landing.summaryFacts.map((fact) => (
                <p key={fact} data-testid="location-landing-summary">
                  {fact}
                </p>
              ))}
              {landing.coverageLabel ? (
                <p className="text-zinc-500" data-testid="location-landing-coverage">
                  {landing.coverageLabel}
                </p>
              ) : null}
              {landing.exceptionLabels.map((label) => (
                <p key={label} className="text-zinc-800" data-testid="location-landing-exception">
                  {label}
                </p>
              ))}
              {landing.moreExceptionCount > 0 ? (
                <p className="text-zinc-500" data-testid="location-landing-more">
                  +{landing.moreExceptionCount} more
                </p>
              ) : null}
              {landing.nextLabel ? (
                <p data-testid="location-landing-next">{landing.nextLabel}</p>
              ) : null}
              {landing.configureHref ? (
                <p>
                  <Link
                    href={landing.configureHref}
                    className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
                    data-testid="location-landing-configure"
                  >
                    Configure this location
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {hasChildren && expanded ? (
        <ul
          className={
            depth === 0
              ? "border-t border-zinc-200 bg-white py-1"
              : "ml-7 border-l-2 border-zinc-200 py-0.5 pl-2 sm:ml-9 sm:pl-3"
          }
        >
          {node.children.map((child) => (
            <HierarchyNode
              key={child.id}
              node={child}
              vocabulary={vocabulary}
              depth={depth + 1}
              landingByNodeId={landingByNodeId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function DepartmentTree({
  snapshot,
  vocabulary,
  showLabel,
  landingByNodeId,
}: {
  snapshot: LocationsDepartmentSnapshot;
  vocabulary: FacilityVocabulary;
  showLabel: boolean;
  landingByNodeId: Readonly<Record<string, LocationLandingRowState>>;
}) {
  return (
    <section aria-label={snapshot.label} className="space-y-2">
      {showLabel ? (
        <div
          className="border border-zinc-200 bg-zinc-900 px-4 py-3"
          style={{ borderRadius: "1rem" }}
        >
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-white">
            {snapshot.label}
          </h2>
        </div>
      ) : null}
      <ul className="flex flex-col gap-2">
        {snapshot.roots.map((root) => (
          <HierarchyNode
            key={root.id}
            node={root}
            vocabulary={vocabulary}
            depth={0}
            landingByNodeId={landingByNodeId}
          />
        ))}
      </ul>
    </section>
  );
}

function nodeCount(view: LocationsViewModel): number {
  let n = 0;
  const walk = (nodes: readonly LocationsTreeNode[]) => {
    for (const node of nodes) {
      if (node.kind !== "FACILITY") n += 1;
      walk(node.children);
    }
  };
  for (const dept of view.departmentSnapshots) walk(dept.roots);
  return n;
}

export function LocationsHierarchyBrowser({
  view,
  vocabulary,
  projectionError,
  canConfigureFacility,
  lensSummary,
  landingByNodeId = {},
}: LocationsHierarchyBrowserProps) {
  const total = nodeCount(view);
  const departmentLabel =
    view.departmentSnapshots.length === 1
      ? view.departmentSnapshots[0]!.label
      : null;
  const configureLink = canConfigureFacility ? (
    <Link
      href="/admin/facility/builder"
      className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
    >
      Configure facility structure
    </Link>
  ) : null;
  const manageLink = canConfigureFacility ? (
    <Link
      href="/admin/facility/builder"
      className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
    >
      Manage locations in Facility Builder
    </Link>
  ) : null;

  let body: ReactNode;

  if (projectionError) {
    body = (
      <EmptyState
        icon="locations"
        title="Locations are temporarily unavailable."
        description="Operational location eligibility could not be resolved. Try again shortly."
        tone="warning"
        data-testid="locations-unavailable"
      />
    );
  } else if (total === 0) {
    body = (
      <EmptyState
        icon="locations"
        title="No locations assigned"
        description={
          departmentLabel
            ? `${departmentLabel} does not currently have any locations assigned in Facility Builder.`
            : "No locations are assigned for this mode in Facility Builder."
        }
        action={manageLink}
        data-testid="locations-empty"
      />
    );
  } else {
    body = (
      <div className="space-y-6" data-testid="locations-hierarchy">
        {view.departmentSnapshots.map((snapshot) => (
          <DepartmentTree
            key={snapshot.departmentId}
            snapshot={snapshot}
            vocabulary={vocabulary}
            showLabel={view.lensMode === "FACILITY"}
            landingByNodeId={landingByNodeId}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <PageHeader
        icon="locations"
        title="Locations"
        status={
          lensSummary ? (
            <StatusBadge variant="neutral">{lensSummary}</StatusBadge>
          ) : null
        }
        actions={configureLink}
      />
      {body}
    </section>
  );
}

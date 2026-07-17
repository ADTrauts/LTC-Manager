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
  LocationsDepartmentSnapshot,
  LocationsTreeNode,
  LocationsViewModel,
} from "@/lib/locations";
import { NAV_ZONE_LABELS } from "@/lib/nav-zones";

export type LocationsHierarchyBrowserProps = {
  view: LocationsViewModel;
  vocabulary: FacilityVocabulary;
  projectionError: string | null;
  canConfigureFacility: boolean;
  lensSummary: string | null;
};

function kindLabel(
  kind: LocationsTreeNode["kind"],
  vocabulary: FacilityVocabulary,
): string | null {
  switch (kind) {
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

function countExperiences(node: LocationsTreeNode): number {
  return node.areas.reduce((sum, area) => sum + area.experiences.length, 0);
}

function HierarchyNode({
  node,
  vocabulary,
  depth,
}: {
  node: LocationsTreeNode;
  vocabulary: FacilityVocabulary;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const level = kindLabel(node.kind, vocabulary);
  const experienceCount = countExperiences(node);
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
          />
        ))}
      </>
    );
  }

  return (
    <li className="list-none" data-location-id={node.id} data-kind={node.kind}>
      <div
        className={`flex flex-wrap items-start gap-2 rounded-md py-2 ${
          depth === 0 ? "border-b border-zinc-100" : ""
        }`}
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100"
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
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
            <LocationIcon className="h-4 w-4 text-zinc-400" aria-hidden />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {node.href ? (
              <Link
                href={node.href}
                className="text-sm font-medium text-zinc-900 hover:underline"
              >
                {node.label}
              </Link>
            ) : (
              <span
                className={
                  node.presentation === "STRUCTURAL"
                    ? "text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500"
                    : "text-sm font-medium text-zinc-900"
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
            {experienceCount > 0 ? (
              <StatusBadge variant="in_progress">
                {experienceCount} Experience{experienceCount === 1 ? "" : "s"}
              </StatusBadge>
            ) : null}
          </div>
          {node.areas.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
              {node.areas.map((area) => (
                <li key={area.areaKey}>
                  <span className="font-medium text-zinc-700">{area.label}</span>
                  {": "}
                  {area.experiences.map((exp) => exp.label).join(", ")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {hasChildren && expanded ? (
        <ul className="space-y-0">
          {node.children.map((child) => (
            <HierarchyNode
              key={child.id}
              node={child}
              vocabulary={vocabulary}
              depth={depth + 1}
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
}: {
  snapshot: LocationsDepartmentSnapshot;
  vocabulary: FacilityVocabulary;
  showLabel: boolean;
}) {
  return (
    <section aria-label={snapshot.label} className="space-y-2">
      {showLabel ? (
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-zinc-500">
          {snapshot.label}
        </h2>
      ) : null}
      <ul className="space-y-0">
        {snapshot.roots.map((root) => (
          <HierarchyNode
            key={root.id}
            node={root}
            vocabulary={vocabulary}
            depth={0}
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
}: LocationsHierarchyBrowserProps) {
  const hasMissingProfile = view.diagnostics.some(
    (d) => d.code === "MISSING_ACTIVE_PROFILE",
  );
  const hasConfigGaps = view.diagnostics.some(
    (d) =>
      d.code === "ROOM_UNMAPPED" ||
      d.code === "ORPHAN_BINDING" ||
      d.code === "INVALID_ARCHETYPE_REFERENCE",
  );
  const total = nodeCount(view);
  const configureLink = canConfigureFacility ? (
    <Link
      href="/admin/facility/builder"
      className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
    >
      Configure facility structure
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
  } else if (hasMissingProfile && total === 0) {
    body = (
      <EmptyState
        icon="locations"
        title="This department does not have an active operational profile."
        description="Ask an administrator to activate a department profile before locations appear here."
        tone="warning"
        data-testid="locations-missing-profile"
      />
    );
  } else if (total === 0) {
    body = (
      <EmptyState
        icon="locations"
        title="No operational locations are available for this mode."
        description="Assign rooms in Facility Builder and ensure department responsibilities cover them."
        action={configureLink}
        data-testid="locations-empty"
      />
    );
  } else {
    body = (
      <div className="space-y-6" data-testid="locations-hierarchy">
        {hasConfigGaps ? (
          <p
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            role="status"
          >
            Some assigned rooms are not yet mapped to a department room archetype.
          </p>
        ) : null}
        {view.departmentSnapshots.map((snapshot) => (
          <DepartmentTree
            key={snapshot.departmentId}
            snapshot={snapshot}
            vocabulary={vocabulary}
            showLabel={view.lensMode === "FACILITY"}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <PageHeader
        icon="locations"
        eyebrow={NAV_ZONE_LABELS.LOCATIONS}
        title="Locations"
        subtitle="Browse the locations available in the current operational mode."
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

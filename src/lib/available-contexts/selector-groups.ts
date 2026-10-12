import type { AvailableContextPresentation } from "./types";

export type WorkspaceSelectorGroupId = "Facilities" | "Organizations";

export type WorkspaceSelectorGroup = {
  group: WorkspaceSelectorGroupId;
  items: AvailableContextPresentation[];
};

export function workspaceRowProvenance(item: AvailableContextPresentation): string | null {
  if (item.kind !== "facility_partner") return null;
  const match = /^Via (.+) · /.exec(item.subtitle);
  return match?.[1] ?? null;
}

export function workspaceRowAccessibleName(item: AvailableContextPresentation): string {
  const via = workspaceRowProvenance(item);
  return via ? `${item.title}, ${item.roleLabel} via ${via}` : `${item.title}, ${item.roleLabel}`;
}

export function filterWorkspacePresentations(
  items: readonly AvailableContextPresentation[],
  query: string,
): AvailableContextPresentation[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((item) => {
    const haystack = [
      item.title,
      item.subtitle,
      item.roleLabel,
      item.departmentSummary,
      workspaceRowProvenance(item),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

/**
 * Selector grouping only. Does not change My Access groups or the resolver.
 * Facilities = internal + partner, preserving incoming order.
 */
export function groupWorkspaceSelectorPresentations(
  items: readonly AvailableContextPresentation[],
): WorkspaceSelectorGroup[] {
  const facilities = items.filter(
    (item) => item.kind === "facility_internal" || item.kind === "facility_partner",
  );
  const organizations = items.filter((item) => item.kind === "organization");
  return (
    [
      { group: "Facilities" as const, items: facilities },
      { group: "Organizations" as const, items: organizations },
    ] satisfies WorkspaceSelectorGroup[]
  ).filter((entry) => entry.items.length > 0);
}

export function workspaceSelectorCanSwitch(
  items: readonly AvailableContextPresentation[],
  currentContextKey: string | null,
): boolean {
  return items.some((item) => item.contextKey !== currentContextKey);
}

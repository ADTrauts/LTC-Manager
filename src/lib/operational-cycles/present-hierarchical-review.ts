/**
 * Hierarchical Review presentation for Operational Cycle draft changes.
 * Groups changes under top-level Operational Cycles in hierarchy order.
 */

import { formatCycleClock, formatCycleWindow } from "./cycle-display";
import { projectCycleHierarchy } from "./cycle-hierarchy";
import type { CycleDraftChange, CycleLifecycleRow } from "./cycle-lifecycle";
import type { KeyTimeGroupDefinition } from "./types";

export type HierarchicalReviewChildSummary = {
  stableKey: string;
  label: string;
  role: "phase" | "key_time";
  summary: string;
  changeKinds: string[];
};

export type HierarchicalReviewBranch = {
  stableKey: string;
  label: string;
  window: string | null;
  roomSummary: string | null;
  bullets: string[];
  children: HierarchicalReviewChildSummary[];
  /** True when this branch has any field changes (including nested). */
  hasChanges: boolean;
  collapsedByDefault: boolean;
};

export type HierarchicalReviewPresentation = {
  mode: "first_setup" | "diff" | "empty";
  changeCount: number;
  branches: HierarchicalReviewBranch[];
};

function keyTimeLine(
  groups: readonly KeyTimeGroupDefinition[],
): string {
  if (groups.length === 0) return "Key Time · no due-time groups";
  const roomCount = new Set(groups.flatMap((g) => g.spaceIds)).size;
  const groupPart =
    groups.length === 1 ? "1 due-time group" : `${groups.length} due-time groups`;
  const roomPart = roomCount === 1 ? "1 Room" : `${roomCount} Rooms`;
  if (groups.length === 1) {
    const due = groups[0]!.dueLocal;
    return `Key Time · ${groupPart} · ${roomPart} · ${formatCycleClock(due)}`;
  }
  const dueParts = groups
    .map((g) => {
      const n = g.spaceIds.length;
      return `${formatCycleClock(g.dueLocal)} · ${n === 1 ? "1 Room" : `${n} Rooms`}`;
    })
    .join("; ");
  return `Key Time · ${groupPart} · ${roomPart} — ${dueParts}`;
}

function roomCountLabel(n: number): string {
  return n === 1 ? "1 Room" : `${n} Rooms`;
}

function changesForKey(
  changes: readonly CycleDraftChange[],
  stableKey: string,
): CycleDraftChange[] {
  return changes.filter((c) => c.stableKey === stableKey);
}

function humanBullet(change: CycleDraftChange, draft: CycleLifecycleRow | undefined): string {
  if (change.kind === "added") {
    if (draft?.nodeKind === "KEY_TIME") {
      return `${draft.label} added — ${keyTimeLine(draft.keyTimeGroups)}`;
    }
    if (draft?.locationInheritFromParent && draft.parentStableKey) {
      return `${draft.label} added — uses parent locations`;
    }
    if (draft && draft.spaceIds.length > 0) {
      return `${draft.label} added — ${roomCountLabel(draft.spaceIds.length)}`;
    }
    return `${change.label} added`;
  }
  if (change.kind === "location_inherit") {
    return change.summary
      .replace(/inherits locations from its parent phase/g, "uses parent locations")
      .replace(/no longer inherits locations from its parent phase/g, "uses specific Rooms")
      .replace(/^“(.+?)”\s*/, "");
  }
  if (change.kind === "location") {
    const cleaned = change.summary.replace(/^“[^”]+”\s*/, "");
    if (/^rooms:/i.test(cleaned)) return cleaned.replace(/^rooms:\s*/i, "Rooms: ");
    if (/^scope:/i.test(cleaned)) return cleaned.replace(/^scope:\s*/i, "Locations: ");
    return cleaned;
  }
  if (change.kind === "key_times" && draft) {
    return keyTimeLine(draft.keyTimeGroups);
  }
  if (change.kind === "parent") {
    return change.summary.replace(/^“(.+?)”\s*/, "");
  }
  if (change.kind === "milestones" || change.kind === "service_times") {
    return change.summary
      .replace(/SERVICE_STARTED/g, "legacy meal-service timing")
      .replace(/Meal Service Start/g, "Legacy meal-service timing")
      .replace(/^“(.+?)”\s*/, "");
  }
  return change.summary.replace(/^“(.+?)”\s*/, "");
}

/**
 * Build hierarchy-ordered review branches from draft changes.
 * Unchanged top-level cycles with no nested changes are omitted.
 */
export function presentHierarchicalCycleReview(input: {
  changes: readonly CycleDraftChange[];
  drafts: readonly CycleLifecycleRow[];
  currentCount: number;
  locationNames?: Readonly<Record<string, string>>;
}): HierarchicalReviewPresentation {
  const { changes, drafts, currentCount } = input;
  const draftsByKey = new Map(drafts.map((d) => [d.stableKey, d]));
  const hierarchy = projectCycleHierarchy(
    drafts.map((d) => ({
      stableKey: d.stableKey,
      label: d.label,
      parentStableKey: d.parentStableKey,
      displaySequence: d.displaySequence,
      nodeKind: d.nodeKind,
      id: d.id,
    })),
  );

  const changedKeys = new Set(changes.map((c) => c.stableKey));
  // Ordering changes use synthetic keys like __roots__ — ignore for node matching
  for (const c of changes) {
    if (c.kind === "ordering") changedKeys.delete(c.stableKey);
  }

  const allAdded =
    changes.length > 0 && changes.every((c) => c.kind === "added" || c.kind === "ordering");
  const mode: HierarchicalReviewPresentation["mode"] =
    changes.length === 0
      ? "empty"
      : currentCount === 0 && allAdded
        ? "first_setup"
        : "diff";

  const branches: HierarchicalReviewBranch[] = [];

  for (const root of hierarchy.roots) {
    const rootDraft = draftsByKey.get(root.stableKey);
    if (!rootDraft) continue;

    const descendantKeys = collectKeys(root);
    const branchTouched = [root.stableKey, ...descendantKeys].some((k) => changedKeys.has(k));
    const orderingTouches =
      changes.some((c) => c.kind === "ordering" && (c.stableKey === root.stableKey || c.stableKey === "")) ||
      changes.some((c) => c.kind === "ordering" && c.summary.includes(root.label));

    if (!branchTouched && !orderingTouches && mode !== "first_setup") continue;
    if (mode === "first_setup" && !branchTouched) {
      // Still show all roots on first setup
    }

    const rootChanges = changesForKey(changes, root.stableKey);
    const bullets: string[] = [];

    if (mode === "first_setup") {
      bullets.push("Operational Cycle added");
      if (rootDraft.spaceIds.length > 0) {
        bullets.push(roomCountLabel(rootDraft.spaceIds.length));
      }
    } else {
      for (const change of rootChanges) {
        if (change.kind === "ordering") continue;
        bullets.push(humanBullet(change, rootDraft));
      }
    }

    const children: HierarchicalReviewChildSummary[] = [];
    for (const childNode of root.children) {
      const childDraft = draftsByKey.get(childNode.stableKey);
      if (!childDraft) continue;
      const childTouched =
        changedKeys.has(childNode.stableKey) ||
        childNode.children.some((gc) => changedKeys.has(gc.stableKey));
      if (!childTouched && mode !== "first_setup") continue;

      const childChanges = changesForKey(changes, childNode.stableKey);
      let summary: string;
      if (childDraft.nodeKind === "KEY_TIME") {
        summary = keyTimeLine(childDraft.keyTimeGroups);
      } else if (childDraft.locationInheritFromParent) {
        summary = `Uses ${rootDraft.label} locations`;
      } else if (childDraft.spaceIds.length > 0) {
        summary = roomCountLabel(childDraft.spaceIds.length);
      } else if (mode === "first_setup") {
        summary = "Phase";
      } else {
        summary =
          childChanges.length > 0
            ? humanBullet(childChanges[0]!, childDraft)
            : "Updated";
      }

      children.push({
        stableKey: childNode.stableKey,
        label: childDraft.label,
        role: childDraft.nodeKind === "KEY_TIME" ? "key_time" : "phase",
        summary,
        changeKinds: childChanges.map((c) => c.kind),
      });

      if (mode === "first_setup" || childChanges.some((c) => c.kind === "added")) {
        if (childDraft.nodeKind === "KEY_TIME") {
          bullets.push(`${childDraft.label} — ${keyTimeLine(childDraft.keyTimeGroups)}`);
        } else if (childDraft.locationInheritFromParent) {
          bullets.push(`${childDraft.label} — uses ${rootDraft.label} locations`);
        } else {
          bullets.push(`${childDraft.label} added`);
        }
      } else {
        for (const change of childChanges) {
          bullets.push(`${childDraft.label}: ${humanBullet(change, childDraft)}`);
        }
      }

      // Grandchildren (e.g. nested phase under Prep — rare but preserve order)
      for (const grand of childNode.children) {
        const gDraft = draftsByKey.get(grand.stableKey);
        if (!gDraft) continue;
        if (!changedKeys.has(grand.stableKey) && mode !== "first_setup") continue;
        const gChanges = changesForKey(changes, grand.stableKey);
        children.push({
          stableKey: grand.stableKey,
          label: `${childDraft.label} → ${gDraft.label}`,
          role: gDraft.nodeKind === "KEY_TIME" ? "key_time" : "phase",
          summary:
            gDraft.nodeKind === "KEY_TIME"
              ? keyTimeLine(gDraft.keyTimeGroups)
              : gDraft.locationInheritFromParent
                ? "Uses parent locations"
                : roomCountLabel(gDraft.spaceIds.length),
          changeKinds: gChanges.map((c) => c.kind),
        });
      }
    }

    for (const change of changes) {
      if (change.kind === "ordering" && change.summary.includes(root.label)) {
        bullets.push(change.summary);
      }
    }

    const roomSummary =
      rootDraft.nodeKind === "PERIOD" && rootDraft.spaceIds.length > 0
        ? roomCountLabel(rootDraft.spaceIds.length)
        : rootDraft.locationInheritFromParent
          ? "Uses parent locations"
          : null;

    branches.push({
      stableKey: root.stableKey,
      label: root.label,
      window:
        rootDraft.startLocal && rootDraft.endLocal
          ? formatCycleWindow(rootDraft.startLocal, rootDraft.endLocal)
          : null,
      roomSummary,
      bullets: uniqueStrings(bullets),
      children,
      hasChanges: branchTouched || mode === "first_setup",
      collapsedByDefault: mode === "diff" && !branchTouched,
    });
  }

  // Include orphaned change lines that didn't map to a draft root (ordering-only)
  const orphanOrdering = changes.filter(
    (c) => c.kind === "ordering" && !branches.some((b) => c.summary.includes(b.label)),
  );
  if (orphanOrdering.length > 0 && branches.length > 0) {
    branches[0]!.bullets.push(...orphanOrdering.map((c) => c.summary));
  }

  return {
    mode,
    changeCount: changes.filter((c) => c.kind !== "ordering").length + orphanOrdering.length,
    branches,
  };
}

function collectKeys(node: {
  stableKey: string;
  children: Array<{ stableKey: string; children: unknown[] }>;
}): string[] {
  const keys: string[] = [];
  for (const child of node.children as Array<{
    stableKey: string;
    children: Array<{ stableKey: string; children: unknown[] }>;
  }>) {
    keys.push(child.stableKey, ...collectKeys(child));
  }
  return keys;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

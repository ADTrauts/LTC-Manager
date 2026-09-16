/**
 * Adapter: Operational Cycle hierarchy → TemporalStripModel.
 *
 * Build uses this to explain configured time. Does not import Prisma.
 * Timing arithmetic is proportional to the parent Period window.
 */

import {
  formatCycleClock,
  formatCycleWindow,
  formatDaysSummary,
} from "@/lib/operational-cycles/cycle-display";
import { projectCycleHierarchy } from "@/lib/operational-cycles/cycle-hierarchy";
import type {
  TemporalStripModel,
  TemporalStripPoint,
  TemporalStripSpan,
  TemporalStripState,
} from "@/lib/design-system/temporal-strip-contract";
import {
  assignOverlapLanes,
  buildTemporalTicks,
  minutesFromLocalHhMm,
  offsetOnTrack,
} from "@/lib/design-system/temporal-strip-math";

export type CycleTemporalInputRow = {
  id: string;
  stableKey: string;
  label: string;
  parentStableKey: string | null;
  displaySequence?: number;
  nodeKind: "PERIOD" | "KEY_TIME";
  startLocal: string | null;
  endLocal: string | null;
  overnight?: boolean;
  applicableDaysOfWeek?: readonly number[];
  locationInheritFromParent?: boolean;
  spaceIds?: readonly string[];
  keyTimeGroups?: readonly { dueLocal: string; spaceIds: readonly string[] }[];
};

function formatAbsoluteMinutes(absoluteMinutes: number): string {
  const normalized = ((absoluteMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const hhmm = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return formatCycleClock(hhmm);
}

function roomCountLabel(count: number): string | undefined {
  if (count <= 0) return undefined;
  return `${count} ${count === 1 ? "Room" : "Rooms"}`;
}

function resolveState(input: {
  id: string;
  selectedId?: string | null;
  attentionIds?: ReadonlySet<string>;
  readOnly?: boolean;
}): TemporalStripState {
  if (input.attentionIds?.has(input.id)) return "attention";
  if (input.selectedId === input.id) return "selected";
  if (input.readOnly) return "configured";
  return "configured";
}

/**
 * Build a TemporalStripModel for one root Period and its direct/nested children.
 * Returns null when the root has no usable start/end window.
 */
export function cycleRootToTemporalStrip(input: {
  root: CycleTemporalInputRow;
  descendants: readonly CycleTemporalInputRow[];
  selectedId?: string | null;
  attentionIds?: ReadonlySet<string>;
  /** When true, prefer configured (read-only) tone. */
  readOnly?: boolean;
}): TemporalStripModel | null {
  const { root } = input;
  if (root.nodeKind !== "PERIOD" || !root.startLocal || !root.endLocal) return null;

  const trackStart = minutesFromLocalHhMm(root.startLocal);
  const trackEndRaw = minutesFromLocalHhMm(root.endLocal);
  if (trackStart == null || trackEndRaw == null) return null;

  const overnight = Boolean(root.overnight) || trackEndRaw <= trackStart;
  const trackMeta = offsetOnTrack({
    trackStartMinutes: trackStart,
    trackEndMinutes: trackEndRaw,
    overnight,
    absoluteMinutes: trackStart,
  });
  const duration = trackMeta.duration;

  const spans: TemporalStripSpan[] = [
    {
      id: root.id,
      kind: "period",
      label: root.label,
      startOffset: 0,
      endOffset: duration,
      state: resolveState({
        id: root.id,
        selectedId: input.selectedId,
        attentionIds: input.attentionIds,
        readOnly: input.readOnly,
      }),
      detail: [
        formatCycleWindow(root.startLocal, root.endLocal),
        root.applicableDaysOfWeek
          ? formatDaysSummary(root.applicableDaysOfWeek)
          : null,
        roomCountLabel(root.spaceIds?.length ?? 0),
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];

  const points: TemporalStripPoint[] = [];

  for (const child of input.descendants) {
    if (child.nodeKind === "KEY_TIME") {
      const groups = child.keyTimeGroups ?? [];
      const primaryDue = groups[0]?.dueLocal ?? null;
      const dueMinutes = minutesFromLocalHhMm(primaryDue);
      if (dueMinutes == null && groups.length === 0) {
        // Still list as attention at mid-track if misconfigured.
        points.push({
          id: child.id,
          kind: "keyTime",
          label: child.label,
          offset: duration / 2,
          state: "attention",
          detail: "No due times configured",
          outOfRange: true,
        });
        continue;
      }
      const abs = dueMinutes ?? trackStart;
      const placed = offsetOnTrack({
        trackStartMinutes: trackStart,
        trackEndMinutes: trackEndRaw,
        overnight,
        absoluteMinutes: abs,
      });
      const sublabels = groups.map((group) => {
        const rooms = roomCountLabel(group.spaceIds.length);
        const clock = formatCycleClock(group.dueLocal);
        return rooms ? `${clock} · ${rooms}` : clock;
      });
      const outOfRange =
        placed.outOfRange || Boolean(input.attentionIds?.has(child.id));
      points.push({
        id: child.id,
        kind: "keyTime",
        label: child.label,
        offset: placed.offset,
        state: outOfRange
          ? "attention"
          : resolveState({
              id: child.id,
              selectedId: input.selectedId,
              attentionIds: input.attentionIds,
              readOnly: input.readOnly,
            }),
        sublabels: sublabels.length > 1 ? sublabels : undefined,
        detail:
          sublabels.length === 1
            ? sublabels[0]
            : roomCountLabel(groups.reduce((n, g) => n + g.spaceIds.length, 0)),
        outOfRange,
      });
      continue;
    }

    // Nested PERIOD / Phase
    if (!child.startLocal || !child.endLocal) continue;
    const startMin = minutesFromLocalHhMm(child.startLocal);
    const endMin = minutesFromLocalHhMm(child.endLocal);
    if (startMin == null || endMin == null) continue;

    const startPlaced = offsetOnTrack({
      trackStartMinutes: trackStart,
      trackEndMinutes: trackEndRaw,
      overnight,
      absoluteMinutes: startMin,
    });
    const endPlaced = offsetOnTrack({
      trackStartMinutes: trackStart,
      trackEndMinutes: trackEndRaw,
      overnight,
      absoluteMinutes: endMin,
    });
    const outOfRange =
      startPlaced.outOfRange ||
      endPlaced.outOfRange ||
      Boolean(input.attentionIds?.has(child.id));
    let endOffset = endPlaced.offset;
    if (endOffset <= startPlaced.offset) {
      // Nested overnight within parent — extend.
      endOffset = Math.min(duration, startPlaced.offset + 1);
    }
    spans.push({
      id: child.id,
      kind: "phase",
      label: child.label,
      startOffset: startPlaced.offset,
      endOffset,
      state: outOfRange
        ? "attention"
        : resolveState({
            id: child.id,
            selectedId: input.selectedId,
            attentionIds: input.attentionIds,
            readOnly: input.readOnly,
          }),
      detail: [
        formatCycleWindow(child.startLocal, child.endLocal),
        child.locationInheritFromParent
          ? "Uses parent locations"
          : roomCountLabel(child.spaceIds?.length ?? 0),
      ]
        .filter(Boolean)
        .join(" · "),
      outOfRange,
    });
  }

  const phaseSpans = spans.filter((s) => s.kind === "phase");
  const lanes = assignOverlapLanes(phaseSpans);
  for (const span of spans) {
    if (span.kind === "phase") {
      span.lane = lanes.get(span.id) ?? 0;
    }
  }

  const ticks = buildTemporalTicks({
    trackStartMinutes: trackStart,
    durationMinutes: duration,
    formatLabel: formatAbsoluteMinutes,
  });

  return {
    ariaLabel: `${root.label} operating rhythm`,
    scaleStartLabel: formatCycleClock(root.startLocal),
    scaleEndLabel: formatCycleClock(root.endLocal),
    durationMinutes: duration,
    spans,
    points,
    ticks,
    now: null,
    selectedId: input.selectedId ?? null,
  };
}

/**
 * Project a flat cycle list into TemporalStrip models for each root Period.
 */
export function cyclesToTemporalStrips(input: {
  rows: readonly CycleTemporalInputRow[];
  selectedId?: string | null;
  attentionIds?: ReadonlySet<string>;
  readOnly?: boolean;
}): TemporalStripModel[] {
  const tree = projectCycleHierarchy(input.rows);
  const byKey = new Map(input.rows.map((row) => [row.stableKey, row]));
  const models: TemporalStripModel[] = [];

  for (const rootNode of tree.roots) {
    const root = byKey.get(rootNode.stableKey);
    if (!root || root.nodeKind !== "PERIOD") continue;

    const descendants: CycleTemporalInputRow[] = [];
    function walk(node: (typeof tree.roots)[number]) {
      for (const child of node.children) {
        const row = byKey.get(child.stableKey);
        if (row) descendants.push(row);
        walk(child);
      }
    }
    walk(rootNode);

    const model = cycleRootToTemporalStrip({
      root,
      descendants,
      selectedId: input.selectedId,
      attentionIds: input.attentionIds,
      readOnly: input.readOnly,
    });
    if (model) models.push(model);
  }

  return models;
}

/**
 * Domain-neutral helpers for TemporalStrip positioning.
 * Pure math — no React, no Prisma.
 */

export function minutesFromLocalHhMm(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Offset of `absoluteMinutes` from track start, supporting overnight tracks
 * (end before start on clock → duration crosses midnight).
 */
export function offsetOnTrack(input: {
  trackStartMinutes: number;
  trackEndMinutes: number;
  overnight: boolean;
  absoluteMinutes: number;
}): { offset: number; duration: number; outOfRange: boolean } {
  const { trackStartMinutes, overnight } = input;
  let trackEnd = input.trackEndMinutes;
  if (overnight || trackEnd <= trackStartMinutes) {
    trackEnd += 24 * 60;
  }
  const duration = Math.max(trackEnd - trackStartMinutes, 1);

  let abs = input.absoluteMinutes;
  // Map into [trackStart, trackStart+duration) preferring the overnight extension.
  if (abs < trackStartMinutes) {
    abs += 24 * 60;
  }
  const offset = abs - trackStartMinutes;
  const outOfRange = offset < 0 || offset > duration;
  return {
    offset: Math.min(Math.max(offset, 0), duration),
    duration,
    outOfRange,
  };
}

export function percentOnTrack(offset: number, duration: number): number {
  if (duration <= 0) return 0;
  return (offset / duration) * 100;
}

/** Sensible axis ticks for a track duration (minutes). */
export function buildTemporalTicks(input: {
  trackStartMinutes: number;
  durationMinutes: number;
  formatLabel: (absoluteMinutes: number) => string;
}): Array<{ offset: number; label: string }> {
  const { trackStartMinutes, durationMinutes, formatLabel } = input;
  if (durationMinutes <= 0) return [];

  // Deterministic: ≤4h → 30m, 4–8h → 60m, longer → 2h. Start/end always kept.
  let step = 60;
  if (durationMinutes <= 240) step = 30;
  else if (durationMinutes <= 480) step = 60;
  else step = 120;

  const ticks: Array<{ offset: number; label: string }> = [];
  ticks.push({
    offset: 0,
    label: formatLabel(trackStartMinutes % (24 * 60)),
  });

  const firstTick =
    Math.ceil(trackStartMinutes / step) * step === trackStartMinutes
      ? trackStartMinutes + step
      : Math.ceil(trackStartMinutes / step) * step;

  for (let abs = firstTick; abs < trackStartMinutes + durationMinutes; abs += step) {
    const offset = abs - trackStartMinutes;
    if (offset <= 0 || offset >= durationMinutes) continue;
    // Integer proximity guard — avoid float edge cases across SSR/client.
    const minInterior = Math.max(1, Math.floor(durationMinutes * 0.08));
    const maxInterior = Math.floor(durationMinutes * 0.92);
    if (offset < minInterior || offset > maxInterior) continue;
    ticks.push({
      offset,
      label: formatLabel(((abs % (24 * 60)) + 24 * 60) % (24 * 60)),
    });
  }

  ticks.push({
    offset: durationMinutes,
    label: formatLabel((trackStartMinutes + durationMinutes) % (24 * 60)),
  });

  return ticks;
}

export type TemporalTick = { offset: number; label: string };

/**
 * Presentation-only: choose which tick *labels* to show for a given track width.
 * Guides may still render for every tick. Start/end labels are never dropped.
 */
export function selectVisibleTickLabels(input: {
  ticks: readonly TemporalTick[];
  durationMinutes: number;
  trackWidthPx: number;
  /** Approximate painted label width including breathing room. */
  minLabelWidthPx?: number;
}): TemporalTick[] {
  const ticks = input.ticks;
  if (ticks.length === 0) return [];
  if (ticks.length <= 2) return [...ticks];

  const duration = Math.max(input.durationMinutes, 1);
  const width = Math.max(input.trackWidthPx, 1);
  const minLabel = Math.max(input.minLabelWidthPx ?? 72, 48);
  const maxLabels = Math.max(2, Math.floor(width / minLabel));

  const first = ticks[0]!;
  const last = ticks[ticks.length - 1]!;
  if (maxLabels <= 2) return [first, last];
  if (maxLabels >= ticks.length) {
    return cullCollidingTickLabels(ticks, duration, width, minLabel);
  }

  const interior = ticks.slice(1, -1);
  const slots = maxLabels - 2;
  const isWholeHour = (tick: TemporalTick) => /:00(?:\s|$)/.test(tick.label);
  const preferred = interior.filter(isWholeHour);
  const pool = preferred.length >= Math.min(slots, interior.length) ? preferred : interior;

  const chosen = new Map<number, TemporalTick>();
  chosen.set(first.offset, first);
  chosen.set(last.offset, last);

  if (pool.length <= slots) {
    for (const tick of pool) chosen.set(tick.offset, tick);
  } else {
    for (let i = 0; i < slots; i++) {
      const idx = Math.round(((i + 1) * (pool.length + 1)) / (slots + 1)) - 1;
      const tick = pool[Math.min(Math.max(idx, 0), pool.length - 1)]!;
      chosen.set(tick.offset, tick);
    }
  }

  const sorted = [...chosen.values()].sort((a, b) => a.offset - b.offset);
  return cullCollidingTickLabels(sorted, duration, width, minLabel);
}

/** Drop interior labels whose centers are closer than minLabelWidthPx. Keep ends. */
function cullCollidingTickLabels(
  ticks: readonly TemporalTick[],
  durationMinutes: number,
  trackWidthPx: number,
  minLabelWidthPx: number,
): TemporalTick[] {
  if (ticks.length <= 2) return [...ticks];
  const first = ticks[0]!;
  const last = ticks[ticks.length - 1]!;
  const kept: TemporalTick[] = [first];
  const minGap = minLabelWidthPx * 0.9;

  for (let i = 1; i < ticks.length - 1; i++) {
    const tick = ticks[i]!;
    const prev = kept[kept.length - 1]!;
    const x = (tick.offset / durationMinutes) * trackWidthPx;
    const prevX = (prev.offset / durationMinutes) * trackWidthPx;
    const lastX = trackWidthPx;
    if (x - prevX < minGap) continue;
    if (lastX - x < minGap) continue;
    kept.push(tick);
  }

  const prev = kept[kept.length - 1]!;
  const prevX = (prev.offset / durationMinutes) * trackWidthPx;
  if (prev.offset !== last.offset) {
    if (trackWidthPx - prevX < minGap && kept.length > 1) {
      kept.pop();
    }
    kept.push(last);
  }
  return kept;
}

/**
 * Greedy lane assignment for overlapping spans (deterministic by start, then id).
 */
export function assignOverlapLanes(
  spans: readonly { id: string; startOffset: number; endOffset: number }[],
): Map<string, number> {
  const sorted = [...spans].sort((a, b) => {
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset;
    if (a.endOffset !== b.endOffset) return a.endOffset - b.endOffset;
    return a.id.localeCompare(b.id);
  });
  const laneEnds: number[] = [];
  const result = new Map<string, number>();
  for (const span of sorted) {
    let lane = laneEnds.findIndex((end) => end <= span.startOffset);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(span.endOffset);
    } else {
      laneEnds[lane] = span.endOffset;
    }
    result.set(span.id, lane);
  }
  return result;
}

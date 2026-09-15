/**
 * TemporalStrip — design contract + presentation model.
 *
 * Shared temporal visual grammar for:
 * - Operational Cycles (Build — define time)
 * - Today's Work / Room Workspace (Run — experience time) [future]
 * - Employee My Day / Gentle Hand [future]
 *
 * Do NOT bind domain types (CycleBuilderRow, JobFlow, etc.) into this primitive.
 * Consume presentation/display DTOs only.
 *
 * Character: guided operational timeline — control panel / schedule instrument,
 * not a project-management Gantt. Calm, scannable, precise.
 *
 * Build uses configuration states (normal / selected / attention / inactive).
 * Runtime past/current/upcoming/dueSoon are reserved for Run adapters.
 */

/** Span objects (Period whole window, Phase segment). */
export type TemporalStripSpanKind = "period" | "phase";

/** Point objects (Key Time / checkpoint). */
export type TemporalStripPointKind = "keyTime" | "checkpoint";

/**
 * Visual / semantic states for spans and points.
 * `adjusted` means expectation moved — not a failure.
 * Runtime states (past/current/upcoming/dueSoon) are for future Run adapters.
 */
export type TemporalStripState =
  | "past"
  | "current"
  | "upcoming"
  | "dueSoon"
  | "attention"
  | "adjusted"
  | "inactive"
  /** Configured Build default (no live clock). */
  | "configured"
  /** Selected in Build editor navigation. */
  | "selected";

export type TemporalStripSpan = {
  id: string;
  kind: TemporalStripSpanKind;
  label: string;
  /** Minutes from strip start (same scale as points / now). */
  startOffset: number;
  endOffset: number;
  state: TemporalStripState;
  /** Optional secondary metadata — prefer outside the track when noisy. */
  detail?: string;
  /**
   * When true, the span extends outside the parent Period scale.
   * Renderer must not silently hide the error — use attention styling.
   */
  outOfRange?: boolean;
  /** Deterministic overlap lane (0 = primary). */
  lane?: number;
};

export type TemporalStripPoint = {
  id: string;
  kind: TemporalStripPointKind;
  label: string;
  offset: number;
  state: TemporalStripState;
  /** Optional adjusted clock label when state is `adjusted`. */
  adjustedLabel?: string;
  /** Grouped due times under one Key Time (e.g. "7:45 AM · 4 Rooms"). */
  sublabels?: readonly string[];
  detail?: string;
  outOfRange?: boolean;
};

export type TemporalStripNow = {
  /** Offset along the same scale as spans/points. */
  offset: number;
  label?: string;
};

export type TemporalStripTick = {
  offset: number;
  label: string;
};

/**
 * Presentation input — adapters map domain → this shape.
 * No Prisma / cycle / job-flow imports here.
 *
 * Future Run may add completed/actual/overdue via `state` + optional fields
 * without redesigning the primitive.
 */
export type TemporalStripModel = {
  /** Accessible title for the strip region. */
  ariaLabel: string;
  /** Optional scale start/end labels (e.g. "5:30 AM", "10:00 AM"). */
  scaleStartLabel?: string;
  scaleEndLabel?: string;
  /** Total track duration in minutes (for positioning). */
  durationMinutes: number;
  spans: readonly TemporalStripSpan[];
  points: readonly TemporalStripPoint[];
  ticks?: readonly TemporalStripTick[];
  now?: TemporalStripNow | null;
  selectedId?: string | null;
};

/**
 * Rendering requirements:
 * - desktop: compact horizontal track
 * - tablet/narrow: horizontal scroll without crushing labels
 * - always ship TemporalListFallback (ordered sequence)
 * - accessible: region + list fallback; NOW announced in text when present
 * - no Gantt dependency, no drag, no animation libraries, no live clock loop in Build
 */
export type TemporalStripProps = {
  model: TemporalStripModel;
  /** Prefer "compact" for Build overview / Run boards. */
  density?: "compact" | "comfortable";
  className?: string;
  /** When true, spans/points are buttons that call onSelect. */
  interactive?: boolean;
  onSelect?: (id: string) => void;
  /**
   * List fallback visibility.
   * - "sr-only" (default): screen-reader sequence
   * - "visible": stacked sequence (narrow / details)
   * - false: omit (not recommended)
   */
  listFallback?: "sr-only" | "visible" | false;
};

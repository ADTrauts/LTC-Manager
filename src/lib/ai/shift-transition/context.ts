import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type { OperationalSnapshot } from "@/lib/ai/operational-snapshot/types";

const DEFAULT_LOOKBACK_MS = 6 * 60 * 60 * 1000;
const MAX_LOOKBACK_MS = 8 * 60 * 60 * 1000;
const MIN_LOOKBACK_MS = 4 * 60 * 60 * 1000;

export function resolveShiftLookbackMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.AI_SHIFT_LOOKBACK_MS?.trim();
  if (!raw) return DEFAULT_LOOKBACK_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_LOOKBACK_MS;
  return Math.min(MAX_LOOKBACK_MS, Math.max(MIN_LOOKBACK_MS, n));
}

export function buildShiftContextLabel(input: {
  department: OperationalDepartmentKey | "ALL";
  current: OperationalSnapshot;
  baseline: OperationalSnapshot | null;
}): string {
  const dept =
    input.department === "EVS"
      ? "EVS"
      : input.department === "PLANT"
        ? "Plant"
        : input.department === "DIETARY"
          ? "Dietary"
          : "Facility";

  const currentLabel = input.current.activeOperation.label;
  const baselineLabel = input.baseline?.activeOperation.label ?? null;

  if (baselineLabel && baselineLabel !== currentLabel) {
    const from = shortOp(baselineLabel);
    const to = shortOp(currentLabel);
    if (from && to && from !== to) {
      return `${from} → ${to} transition`;
    }
  }

  if (input.department === "EVS") {
    return `${dept} round handoff`;
  }
  if (input.department === "PLANT") {
    return `${dept} operations transition`;
  }

  const phase = input.current.activeOperation.phase;
  if (phase === "Preparation") {
    return `${shortOp(currentLabel) ?? currentLabel} preparation handoff`;
  }
  return `${shortOp(currentLabel) ?? currentLabel} shift handoff`;
}

function shortOp(label: string): string | null {
  const lower = label.toLowerCase();
  if (lower.includes("breakfast")) return "Breakfast";
  if (lower.includes("lunch")) return "Lunch";
  if (lower.includes("dinner")) return "Dinner";
  return null;
}

export function formatShiftWindowLabel(input: {
  timezone: string;
  windowStart: string | null;
  windowEnd: string;
  baselineAvailable: boolean;
}): string {
  if (!input.baselineAvailable || !input.windowStart) {
    return `Current state · ${input.timezone}`;
  }
  return `Window ${formatIsoLocal(input.windowStart)} → ${formatIsoLocal(input.windowEnd)} · ${input.timezone}`;
}

function formatIsoLocal(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

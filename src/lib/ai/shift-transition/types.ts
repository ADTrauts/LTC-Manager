export type ShiftTransitionUrgency = "attention" | "in_progress" | "monitor";

export type ShiftTransitionResolvedItem = {
  text: string;
  sourcePath: string | null;
};

export type ShiftTransitionCarryForward = {
  title: string;
  reason: string;
  sourcePath: string;
  urgency: ShiftTransitionUrgency;
};

export type ShiftTransitionChangedItem = {
  text: string;
  direction: "new" | "improved" | "worsened" | "unchanged";
  sourcePath: string | null;
};

export type ShiftTransitionResult = {
  title: string;
  summary: string;
  resolved: ShiftTransitionResolvedItem[];
  carryForward: ShiftTransitionCarryForward[];
  changed: ShiftTransitionChangedItem[];
  generatedAt: string;
  baselineAvailable: boolean;
};

export type ShiftTransitionOrigin = "ai" | "fallback" | "cached";

export type ShiftTransitionView = {
  cardTitle: "Shift Transition Summary" | "Operational Change Summary" | "Operational Summary";
  origin: ShiftTransitionOrigin;
  result: ShiftTransitionResult;
  contextLabel: string;
  windowLabel: string;
  provider: string | null;
  model: string | null;
  snapshotHash: string;
  baselineSnapshotHash: string | null;
  promptVersion: string;
  fallbackReason: string | null;
  canRefresh: boolean;
  refreshBlockedReason: string | null;
  generatedAt: string;
};

import type { OperationalSnapshot } from "./types";

export type SnapshotDiffDirection = "new" | "improved" | "worsened" | "unchanged";

export type SnapshotDiffItem = {
  category:
    | "readiness"
    | "location"
    | "staffing"
    | "issues"
    | "inspections"
    | "handoffs";
  text: string;
  direction: SnapshotDiffDirection;
  sourcePath: string | null;
  /** Stable sort key for deterministic ordering. */
  sortKey: string;
};

export type OperationalSnapshotDiff = {
  baselineAvailable: boolean;
  baselineHash: string | null;
  currentHash: string;
  windowStart: string | null;
  windowEnd: string;
  items: SnapshotDiffItem[];
  readinessMoves: {
    toReady: number;
    toInProgress: number;
    toNeedsAttention: number;
  };
  allowedSourcePaths: string[];
};

export type DiffOperationalSnapshotsInput = {
  current: OperationalSnapshot;
  baseline: OperationalSnapshot | null;
  currentHash: string;
  baselineHash?: string | null;
  windowStart?: string | null;
};

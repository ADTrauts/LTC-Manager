/**
 * Phase 6O — already-loaded Supervisor Operations facts.
 * The loader queries. The composer does not.
 */

import type { RuntimeLocationState } from "@/lib/runtime-location-state";

import type { SupervisorHistoricalEvidenceRecord } from "../supervisor-evidence-attention";
import type {
  SupervisorAssignmentFact,
  SupervisorCoverageGap,
  SupervisorOperationsViewModel,
  SupervisorSyncItem,
  SupervisorWorkFact,
} from "./types";

export type SupervisorPresenceFact = {
  id: string;
  firstName: string;
  lastName: string;
  hasCallOff: boolean;
};

export type SupervisorOperationsFacts = {
  now: Date;
  timezone: string;
  operationalDateKey: string;
  oaEnabled: boolean;
  harborLogsEnabled: boolean;
  facility: { id: string; displayName: string };
  department: { id: string; name: string; key: string };
  states: readonly RuntimeLocationState[];
  planStatus: string | null;
  presenceEmployees: readonly SupervisorPresenceFact[];
  assignments: readonly SupervisorAssignmentFact[];
  coverageCounts: { covered: number; atRisk: number; uncovered: number };
  coverageGaps: readonly SupervisorCoverageGap[];
  historicalRecords: readonly SupervisorHistoricalEvidenceRecord[];
  workExceptions: readonly SupervisorWorkFact[];
  sync: {
    retryRequired: number;
    pendingConflicts: number;
    items: SupervisorSyncItem[];
    unscopableExcluded: boolean;
  };
  evsOverlay: SupervisorOperationsViewModel["overlay"]["evs"];
  plantOverlay: SupervisorOperationsViewModel["overlay"]["plant"];
};

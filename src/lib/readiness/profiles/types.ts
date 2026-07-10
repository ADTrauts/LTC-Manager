import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type { OperationalTimeContext } from "@/lib/operational-time";

import type { ReadinessReasonCode, ReadinessState, UnitReadinessSignals } from "../types";

export type ReadinessProfileKey = OperationalDepartmentKey | "NEUTRAL";

export type ReadinessProfileInput = {
  signals: UnitReadinessSignals;
  operationalTime: OperationalTimeContext;
};

export type ReadinessContributingSignal = {
  code: ReadinessReasonCode;
  detail: string;
};

export type ReadinessProfileResult = {
  state: ReadinessState;
  primaryReason: string;
  contributingSignals: ReadinessContributingSignal[];
  evaluatedAt: Date;
  profileKey: ReadinessProfileKey;
};

export type ReadinessProfile = {
  key: ReadinessProfileKey;
  evaluate: (input: ReadinessProfileInput) => ReadinessProfileResult;
};

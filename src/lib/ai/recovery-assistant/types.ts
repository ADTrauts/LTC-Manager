import type { IssueType, RepairPriority } from "@prisma/client";

import type { IssueRecoveryStage } from "@/lib/work/issues/issue-copy";
import type { SnapshotReadinessState } from "@/lib/ai/operational-snapshot/types";
import type { OperationalDepartmentKey } from "@/lib/department-nav";

export type RecoveryKnowledgeItem = {
  title: string;
  summary: string;
  category: string;
  sourcePath: string;
};

export type RecoveryAvailableAction = {
  key: string;
  label: string;
  sourcePath: string;
};

export type RecoverySnapshot = {
  generatedAt: string;
  facilityLocalTime: string;
  timezone: string;
  serviceDate: string;
  department: OperationalDepartmentKey | "ALL";
  activeOperation: {
    label: string;
    phase: "Preparation" | "Execution";
    scheduledTime: string | null;
  };
  issue: {
    id: string;
    issueType: IssueType;
    title: string;
    sanitizedDescription: string;
    priority: RepairPriority;
    recoveryStage: IssueRecoveryStage;
    reportedAt: string;
    dueAt: string | null;
    assigned: boolean;
    relatedAsset: {
      id: string;
      name: string;
      status: string;
      criticality: string;
    } | null;
    location: {
      id: string;
      name: string;
      readinessState: SnapshotReadinessState;
      readinessReason: string;
    };
    recentUpdates: Array<{
      timestamp: string;
      sanitizedSummary: string;
      status: string | null;
    }>;
  };
  operationalImpact: {
    currentServiceAtRisk: boolean;
    currentOperationLabel: string;
    affectedSignals: string[];
    staffingState: string;
    relatedSupplyShorts: number;
    relatedOpenIssues: number;
  };
  knowledge: RecoveryKnowledgeItem[];
  availableActions: RecoveryAvailableAction[];
  allowedSourcePaths: string[];
};

export type RecoveryConfidence = "supported" | "conditional";

export type RecoveryCheckFirstItem = {
  action: string;
  reason: string;
  sourcePath: string | null;
};

export type RecoveryOptionItem = {
  title: string;
  description: string;
  sourcePath: string | null;
  confidence: RecoveryConfidence;
};

export type RecoveryKnowledgeUsedItem = {
  title: string;
  sourcePath: string;
};

export type RecoveryAssistantResult = {
  headline: string;
  situation: string;
  checkFirst: RecoveryCheckFirstItem[];
  recoveryOptions: RecoveryOptionItem[];
  missingInformation: string[];
  knowledgeUsed: RecoveryKnowledgeUsedItem[];
  generatedAt: string;
};

export type RecoveryAssistantOrigin = "ai" | "fallback" | "cached";

export type RecoveryAssistantView = {
  cardTitle: "Recovery Assistant" | "Operational guidance";
  origin: RecoveryAssistantOrigin;
  result: RecoveryAssistantResult;
  issueId: string;
  provider: string | null;
  model: string | null;
  snapshotHash: string;
  promptVersion: string;
  fallbackReason: string | null;
  canRefresh: boolean;
  refreshBlockedReason: string | null;
  generatedAt: string;
};

/**
 * Runtime check for an outbox JSON payload.
 * TypeScript does not protect a row that was already stored.
 */

import type { CanonicalCoverageState } from "@/lib/scheduling/coverage-expectations/types";

import { isNotificationEventType, type NotificationEventType } from "./event-types";
import type { AttentionPolicyInput } from "./policy-registry";
import {
  assignmentAttentionThreadKey,
  coverageAttentionThreadKey,
  keyPointAttentionThreadKey,
  publicationAttentionThreadKey,
  workOrderAssignmentThreadKey,
  evidenceFailedThreadKey,
  issueCreatedThreadKey,
  assetOutOfServiceThreadKey,
  workOrderInterventionThreadKey,
  workOrderOverdueThreadKey,
  type AssignmentAttentionThread,
  type CoverageAttentionThread,
  type KeyPointAttentionThread,
  type PublicationAttentionThread,
  type WorkOrderAssignmentThread,
  type EvidenceFailedThread,
  type IssueCreatedThread,
  type AssetOutOfServiceThread,
  type WorkOrderInterventionThread,
  type WorkOrderOverdueThread,
} from "./thread-key";

const COVERAGE_STATES = new Set<CanonicalCoverageState>([
  "COVERED",
  "AT_RISK",
  "UNCOVERED",
  "NOT_YET_ASSIGNED",
  "NOT_CONFIRMED",
  "NOT_APPLICABLE",
]);

export type CoverageDisplay = {
  locationLabel: string;
  cycleLabel: string;
};

export type ParsedNotificationPayload =
  | {
      kind: "coverage";
      thread: CoverageAttentionThread;
      threadKey: string;
      policyInput: AttentionPolicyInput;
      display: CoverageDisplay;
    }
  | {
      kind: "assignment";
      thread: AssignmentAttentionThread;
      threadKey: string;
      policyInput: AttentionPolicyInput;
      assigneeEmployeeId: string;
      subjectLabel: string;
      serviceDate: string;
      unitId: string | null;
      spaceId: string | null;
    }
  | {
      kind: "publication";
      thread: PublicationAttentionThread;
      threadKey: string;
      policyInput: AttentionPolicyInput;
      subjectLabel: string;
    }
  | {
      kind: "key_point";
      thread: KeyPointAttentionThread;
      threadKey: string;
      policyInput: AttentionPolicyInput;
      locationLabel: string;
      keyPointLabel: string;
      expectedLocal: string;
    }
  | {
      kind: "work_order";
      thread: WorkOrderAssignmentThread;
      threadKey: string;
      policyInput: AttentionPolicyInput;
      assigneeEmployeeId: string;
      locationLabel: string;
      subjectLabel: string;
    }
  | {
      kind: "work_order_end";
      repairId: string;
      assignmentEventId: string;
      policyInput: AttentionPolicyInput;
    }
  | {
      kind: "issue_created";
      thread: IssueCreatedThread;
      threadKey: string;
      policyInput: AttentionPolicyInput;
      operationalDate: string;
      unitId: string | null;
      spaceId: string | null;
      locationLabel: string;
      subjectLabel: string;
    }
  | {
      kind: "evidence_failed";
      thread: EvidenceFailedThread;
      threadKey: string;
      policyInput: AttentionPolicyInput;
      operationalDate: string;
      unitId: string | null;
      spaceId: string | null;
      locationLabel: string;
      subjectLabel: string;
    }
  | {
      kind: "asset_out_of_service";
      thread: AssetOutOfServiceThread;
      threadKey: string;
      policyInput: AttentionPolicyInput;
      unitId: string | null;
      spaceId: string | null;
      locationLabel: string;
      subjectLabel: string;
    }
  | {
      kind: "asset_outage_end";
      thread: AssetOutOfServiceThread;
      threadKey: string;
      policyInput: AttentionPolicyInput;
    }
  | {
      kind: "work_order_overdue";
      thread: WorkOrderOverdueThread;
      threadKey: string;
      policyInput: AttentionPolicyInput;
      assigneeEmployeeId: string | null;
      locationLabel: string;
      subjectLabel: string;
    }
  | {
      kind: "work_order_overdue_end";
      thread: WorkOrderOverdueThread;
      threadKey: string;
      policyInput: AttentionPolicyInput;
    }
  | {
      kind: "work_order_intervention";
      thread: WorkOrderInterventionThread;
      threadKey: string;
      policyInput: AttentionPolicyInput;
      unitId: string | null;
      spaceId: string | null;
      locationLabel: string;
      subjectLabel: string;
    }
  | {
      kind: "work_order_intervention_end";
      thread: WorkOrderInterventionThread;
      threadKey: string;
      policyInput: AttentionPolicyInput;
    }
  | { kind: "sync_deferred" }
  | {
      kind: "catalog_only";
      eventType: Exclude<
        NotificationEventType,
        | "coverage.became_at_risk"
        | "coverage.became_uncovered"
        | "coverage.restored"
        | "attention.reevaluate"
        | "attention.expired"
        | "assignment.changed"
        | "publication.failed"
        | "sync.conflict_detected"
        | "milestone.overdue"
        | "milestone.recorded"
        | "milestone.deadline_moved"
        | "work_order.assigned"
        | "work_order.assignment_ended"
        | "work_order.overdue"
        | "work_order.overdue_resolved"
        | "work_order.overdue_ended"
        | "work_order.intervention_required"
        | "work_order.intervention_cleared"
        | "work_order.intervention_completed"
        | "work_order.intervention_cancelled"
        | "evidence.failed"
        | "issue.created"
        | "asset.out_of_service"
        | "asset.returned_to_service"
        | "asset.outage_ended"
      >;
    };

export type PayloadParseResult =
  | { ok: true; parsed: ParsedNotificationPayload }
  | { ok: false; code: string };

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function label(value: unknown, fallback: string): string {
  const raw = text(value);
  if (!raw) return fallback;
  return raw.slice(0, 80);
}

function coverageState(value: unknown): CanonicalCoverageState | null {
  return typeof value === "string" && COVERAGE_STATES.has(value as CanonicalCoverageState)
    ? (value as CanonicalCoverageState)
    : null;
}

function coverageThread(
  facilityId: string,
  departmentId: string | null,
  payload: Record<string, unknown>,
): { thread: CoverageAttentionThread } | { code: string } {
  const serviceDate = text(payload.serviceDate);
  const payloadDepartmentId = text(payload.departmentId);
  const spaceId = text(payload.spaceId);
  const responsibility = text(payload.responsibility);
  const cycleStableKey = text(payload.cycleStableKey);
  const episodeId = text(payload.coverageEpisodeId);
  if (!serviceDate || !payloadDepartmentId || !spaceId || !responsibility || !cycleStableKey) {
    return { code: "missing_coverage_grain" };
  }
  if (!episodeId) return { code: "missing_coverage_episode" };
  if (!departmentId || payloadDepartmentId !== departmentId) {
    return { code: "coverage_department_mismatch" };
  }
  const thread: CoverageAttentionThread = {
    kind: "coverage",
    facilityId,
    serviceDate,
    departmentId,
    spaceId,
    responsibility,
    cycleStableKey,
    episodeId,
  };
  try {
    coverageAttentionThreadKey(thread);
  } catch {
    return { code: "missing_coverage_grain" };
  }
  return { thread };
}

export function parseNotificationPayload(input: {
  eventType: string;
  facilityId: string;
  departmentId: string | null;
  payload: unknown;
}): PayloadParseResult {
  const payload = record(input.payload) ?? {};

  if (
    input.eventType === "coverage.became_at_risk" ||
    input.eventType === "coverage.became_uncovered" ||
    input.eventType === "coverage.restored"
  ) {
    const grain = coverageThread(input.facilityId, input.departmentId, payload);
    if ("code" in grain) return { ok: false, code: grain.code };
    const state = coverageState(payload.coverageState);
    if (!state) return { ok: false, code: "missing_coverage_state" };
    const display: CoverageDisplay = {
      locationLabel: label(payload.locationLabel, "Location"),
      cycleLabel: label(payload.cycleLabel, "Service"),
    };
    if (input.eventType === "coverage.became_uncovered") {
      const serviceState = payload.serviceState;
      if (serviceState === "active") {
        return {
          ok: true,
          parsed: {
            kind: "coverage",
            thread: grain.thread,
            threadKey: coverageAttentionThreadKey(grain.thread),
            display,
            policyInput: {
              eventType: input.eventType,
              coverageState: state,
              timing: { serviceState: "active" },
            },
          },
        };
      }
      if (serviceState !== "before" || typeof payload.minutesUntilService !== "number") {
        return { ok: false, code: "invalid_coverage_timing" };
      }
      return {
        ok: true,
        parsed: {
          kind: "coverage",
          thread: grain.thread,
          threadKey: coverageAttentionThreadKey(grain.thread),
          display,
          policyInput: {
            eventType: input.eventType,
            coverageState: state,
            timing: { serviceState: "before", minutesUntilService: payload.minutesUntilService },
          },
        },
      };
    }
    return {
      ok: true,
      parsed: {
        kind: "coverage",
        thread: grain.thread,
        threadKey: coverageAttentionThreadKey(grain.thread),
        display,
        policyInput: { eventType: input.eventType, coverageState: state },
      },
    };
  }

  if (input.eventType === "attention.reevaluate" || input.eventType === "attention.expired") {
    const grain = coverageThread(input.facilityId, input.departmentId, payload);
    if ("code" in grain) return { ok: false, code: grain.code };
    const display: CoverageDisplay = {
      locationLabel: label(payload.locationLabel, "Location"),
      cycleLabel: label(payload.cycleLabel, "Service"),
    };
    if (input.eventType === "attention.expired") {
      const endedReason = payload.endedReason;
      if (endedReason !== "service_window_ended" && endedReason !== "requirement_removed") {
        return { ok: false, code: "invalid_attention_end" };
      }
      return {
        ok: true,
        parsed: {
          kind: "coverage",
          thread: grain.thread,
          threadKey: coverageAttentionThreadKey(grain.thread),
          display,
          policyInput: { eventType: input.eventType, endedReason },
        },
      };
    }
    const state = coverageState(payload.coverageState);
    if (!state) return { ok: false, code: "missing_coverage_state" };
    const serviceState = payload.serviceState;
    if (serviceState === "active") {
      return {
        ok: true,
        parsed: {
          kind: "coverage",
          thread: grain.thread,
          threadKey: coverageAttentionThreadKey(grain.thread),
          display,
          policyInput: {
            eventType: input.eventType,
            coverageState: state,
            timing: { serviceState: "active" },
          },
        },
      };
    }
    if (serviceState !== "before" || typeof payload.minutesUntilService !== "number") {
      return { ok: false, code: "invalid_coverage_timing" };
    }
    return {
      ok: true,
      parsed: {
        kind: "coverage",
        thread: grain.thread,
        threadKey: coverageAttentionThreadKey(grain.thread),
        display,
        policyInput: {
          eventType: input.eventType,
          coverageState: state,
          timing: { serviceState: "before", minutesUntilService: payload.minutesUntilService },
        },
      },
    };
  }

  if (input.eventType === "assignment.changed") {
    const assignmentId = text(payload.assignmentId);
    const assignmentEventId = text(payload.assignmentEventId);
    const serviceDate = text(payload.serviceDate);
    const assigneeEmployeeId = text(payload.assigneeEmployeeId);
    const serviceState = payload.serviceState;
    if (!assignmentId || !assignmentEventId || !serviceDate || !assigneeEmployeeId) {
      return { ok: false, code: "missing_assignment_identity" };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
      return { ok: false, code: "missing_assignment_identity" };
    }
    if (serviceState !== "active" && serviceState !== "inactive") {
      return { ok: false, code: "invalid_assignment_service_state" };
    }
    const thread: AssignmentAttentionThread = {
      kind: "assignment",
      facilityId: input.facilityId,
      assignmentId,
      assignmentEventId,
    };
    try {
      assignmentAttentionThreadKey(thread);
    } catch {
      return { ok: false, code: "missing_assignment_identity" };
    }
    return {
      ok: true,
      parsed: {
        kind: "assignment",
        thread,
        threadKey: assignmentAttentionThreadKey(thread),
        assigneeEmployeeId,
        subjectLabel: label(payload.subjectLabel, "An assignment changed"),
        serviceDate,
        unitId: text(payload.unitId),
        spaceId: text(payload.spaceId),
        policyInput: { eventType: "assignment.changed", serviceState },
      },
    };
  }

  if (input.eventType === "work_order.assigned") {
    const repairId = text(payload.repairId);
    const assignmentEventId = text(payload.assignmentEventId);
    const assigneeEmployeeId = text(payload.assigneeEmployeeId);
    if (!repairId || !assignmentEventId || !assigneeEmployeeId) {
      return { ok: false, code: "missing_work_order_assignment" };
    }
    const thread: WorkOrderAssignmentThread = {
      kind: "work_order_assignment",
      facilityId: input.facilityId,
      repairId,
      assignmentEventId,
    };
    try {
      workOrderAssignmentThreadKey(thread);
    } catch {
      return { ok: false, code: "missing_work_order_assignment" };
    }
    return {
      ok: true,
      parsed: {
        kind: "work_order",
        thread,
        threadKey: workOrderAssignmentThreadKey(thread),
        assigneeEmployeeId,
        locationLabel: label(payload.locationLabel, "this location"),
        subjectLabel: label(payload.subjectLabel, "Work Order"),
        policyInput: { eventType: "work_order.assigned" },
      },
    };
  }

  if (input.eventType === "work_order.assignment_ended") {
    const repairId = text(payload.repairId);
    const assignmentEventId = text(payload.assignmentEventId);
    if (!repairId || !assignmentEventId) {
      return { ok: false, code: "missing_work_order_assignment" };
    }
    if (payload.endedReason !== "responsibility_ended") {
      return { ok: false, code: "invalid_work_order_assignment_end" };
    }
    return {
      ok: true,
      parsed: {
        kind: "work_order_end",
        repairId,
        assignmentEventId,
        policyInput: {
          eventType: "work_order.assignment_ended",
          endedReason: "responsibility_ended",
        },
      },
    };
  }

  if (input.eventType === "issue.created") {
    const issueId = text(payload.issueId);
    const operationalDate = text(payload.operationalDate);
    if (!issueId || !operationalDate) return { ok: false, code: "missing_issue" };
    const thread: IssueCreatedThread = {
      kind: "issue_created",
      facilityId: input.facilityId,
      issueId,
    };
    try {
      issueCreatedThreadKey(thread);
    } catch {
      return { ok: false, code: "missing_issue" };
    }
    return {
      ok: true,
      parsed: {
        kind: "issue_created",
        thread,
        threadKey: issueCreatedThreadKey(thread),
        operationalDate,
        unitId: text(payload.unitId),
        spaceId: text(payload.spaceId),
        locationLabel: label(payload.locationLabel, ""),
        subjectLabel: label(payload.subjectLabel, "Issue"),
        policyInput: { eventType: "issue.created" },
      },
    };
  }

  if (input.eventType === "evidence.failed") {
    const recordId = text(payload.recordId);
    const operationalDate = text(payload.operationalDate);
    if (!recordId || !operationalDate) return { ok: false, code: "missing_evidence_record" };
    const thread: EvidenceFailedThread = {
      kind: "evidence_failed",
      facilityId: input.facilityId,
      recordId,
    };
    try {
      evidenceFailedThreadKey(thread);
    } catch {
      return { ok: false, code: "missing_evidence_record" };
    }
    return {
      ok: true,
      parsed: {
        kind: "evidence_failed",
        thread,
        threadKey: evidenceFailedThreadKey(thread),
        operationalDate,
        unitId: text(payload.unitId),
        spaceId: text(payload.spaceId),
        locationLabel: label(payload.locationLabel, ""),
        subjectLabel: label(payload.subjectLabel, "Record"),
        policyInput: { eventType: "evidence.failed" },
      },
    };
  }

  if (
    input.eventType === "asset.out_of_service" ||
    input.eventType === "asset.returned_to_service" ||
    input.eventType === "asset.outage_ended"
  ) {
    const assetId = text(payload.assetId);
    const historyId = text(payload.historyId);
    if (!assetId || !historyId) return { ok: false, code: "missing_asset" };
    const thread: AssetOutOfServiceThread = {
      kind: "asset_out_of_service",
      facilityId: input.facilityId,
      assetId,
      historyId,
    };
    try {
      assetOutOfServiceThreadKey(thread);
    } catch {
      return { ok: false, code: "missing_asset" };
    }
    const threadKey = assetOutOfServiceThreadKey(thread);
    if (input.eventType === "asset.returned_to_service") {
      return {
        ok: true,
        parsed: {
          kind: "asset_outage_end",
          thread,
          threadKey,
          policyInput: { eventType: "asset.returned_to_service" },
        },
      };
    }
    if (input.eventType === "asset.outage_ended") {
      if (payload.endedReason !== "asset_retired") return { ok: false, code: "invalid_asset_outage_end" };
      return {
        ok: true,
        parsed: {
          kind: "asset_outage_end",
          thread,
          threadKey,
          policyInput: { eventType: "asset.outage_ended", endedReason: "asset_retired" },
        },
      };
    }
    return {
      ok: true,
      parsed: {
        kind: "asset_out_of_service",
        thread,
        threadKey,
        unitId: text(payload.unitId),
        spaceId: text(payload.spaceId),
        locationLabel: label(payload.locationLabel, ""),
        subjectLabel: label(payload.subjectLabel, "Asset"),
        policyInput: { eventType: "asset.out_of_service" },
      },
    };
  }

  if (
    input.eventType === "work_order.intervention_required" ||
    input.eventType === "work_order.intervention_cleared" ||
    input.eventType === "work_order.intervention_completed" ||
    input.eventType === "work_order.intervention_cancelled"
  ) {
    const repairId = text(payload.repairId);
    const openingHistoryId = text(payload.openingHistoryId);
    if (!repairId || !openingHistoryId) return { ok: false, code: "missing_work_order_intervention" };
    const thread: WorkOrderInterventionThread = {
      kind: "work_order_intervention",
      facilityId: input.facilityId,
      repairId,
      openingHistoryId,
    };
    try {
      workOrderInterventionThreadKey(thread);
    } catch {
      return { ok: false, code: "missing_work_order_intervention" };
    }
    const threadKey = workOrderInterventionThreadKey(thread);
    if (input.eventType === "work_order.intervention_cleared") {
      if (payload.endedReason !== "intervention_cleared") {
        return { ok: false, code: "invalid_work_order_intervention_end" };
      }
      return {
        ok: true,
        parsed: {
          kind: "work_order_intervention_end",
          thread,
          threadKey,
          policyInput: { eventType: "work_order.intervention_cleared", endedReason: "intervention_cleared" },
        },
      };
    }
    if (input.eventType === "work_order.intervention_cancelled") {
      if (payload.endedReason !== "work_order_cancelled") {
        return { ok: false, code: "invalid_work_order_intervention_end" };
      }
      return {
        ok: true,
        parsed: {
          kind: "work_order_intervention_end",
          thread,
          threadKey,
          policyInput: {
            eventType: "work_order.intervention_cancelled",
            endedReason: "work_order_cancelled",
          },
        },
      };
    }
    if (input.eventType === "work_order.intervention_completed") {
      return {
        ok: true,
        parsed: {
          kind: "work_order_intervention_end",
          thread,
          threadKey,
          policyInput: { eventType: "work_order.intervention_completed" },
        },
      };
    }
    return {
      ok: true,
      parsed: {
        kind: "work_order_intervention",
        thread,
        threadKey,
        unitId: text(payload.unitId),
        spaceId: text(payload.spaceId),
        locationLabel: label(payload.locationLabel, ""),
        subjectLabel: label(payload.subjectLabel, "Work Order"),
        policyInput: { eventType: "work_order.intervention_required" },
      },
    };
  }

  if (
    input.eventType === "work_order.overdue" ||
    input.eventType === "work_order.overdue_resolved" ||
    input.eventType === "work_order.overdue_ended"
  ) {
    const repairId = text(payload.repairId);
    if (!repairId) return { ok: false, code: "missing_work_order_deadline" };
    const thread: WorkOrderOverdueThread = {
      kind: "work_order_overdue",
      facilityId: input.facilityId,
      repairId,
    };
    try {
      workOrderOverdueThreadKey(thread);
    } catch {
      return { ok: false, code: "missing_work_order_deadline" };
    }
    const threadKey = workOrderOverdueThreadKey(thread);
    if (input.eventType === "work_order.overdue_resolved") {
      return {
        ok: true,
        parsed: {
          kind: "work_order_overdue_end",
          thread,
          threadKey,
          policyInput: { eventType: "work_order.overdue_resolved" },
        },
      };
    }
    if (input.eventType === "work_order.overdue_ended") {
      const endedReason = payload.endedReason;
      if (
        endedReason !== "deadline_moved" &&
        endedReason !== "deadline_removed" &&
        endedReason !== "work_order_cancelled"
      ) {
        return { ok: false, code: "invalid_work_order_overdue_end" };
      }
      return {
        ok: true,
        parsed: {
          kind: "work_order_overdue_end",
          thread,
          threadKey,
          policyInput: { eventType: "work_order.overdue_ended", endedReason },
        },
      };
    }
    return {
      ok: true,
      parsed: {
        kind: "work_order_overdue",
        thread,
        threadKey,
        assigneeEmployeeId: text(payload.assigneeEmployeeId),
        locationLabel: label(payload.locationLabel, "this location"),
        subjectLabel: label(payload.subjectLabel, "Work Order"),
        policyInput: { eventType: "work_order.overdue" },
      },
    };
  }

  if (
    input.eventType === "milestone.overdue" ||
    input.eventType === "milestone.recorded" ||
    input.eventType === "milestone.deadline_moved"
  ) {
    const serviceDate = text(payload.serviceDate);
    const payloadDepartmentId = text(payload.departmentId);
    const spaceId = text(payload.spaceId);
    const cycleStableKey = text(payload.cycleStableKey);
    const expectedLocal = text(payload.expectedLocal);
    if (!serviceDate || !payloadDepartmentId || !spaceId || !cycleStableKey || !expectedLocal) {
      return { ok: false, code: "missing_key_point_grain" };
    }
    if (!input.departmentId || payloadDepartmentId !== input.departmentId) {
      return { ok: false, code: "key_point_department_mismatch" };
    }
    const thread: KeyPointAttentionThread = {
      kind: "key_point",
      facilityId: input.facilityId,
      serviceDate,
      departmentId: payloadDepartmentId,
      spaceId,
      cycleStableKey,
    };
    try {
      keyPointAttentionThreadKey(thread);
    } catch {
      return { ok: false, code: "missing_key_point_grain" };
    }
    const policyInput: AttentionPolicyInput =
      input.eventType === "milestone.overdue"
        ? { eventType: "milestone.overdue" }
        : input.eventType === "milestone.recorded"
          ? { eventType: "milestone.recorded" }
          : { eventType: "milestone.deadline_moved" };
    return {
      ok: true,
      parsed: {
        kind: "key_point",
        thread,
        threadKey: keyPointAttentionThreadKey(thread),
        policyInput,
        locationLabel: label(payload.locationLabel, "Location"),
        keyPointLabel: label(payload.keyPointLabel, "Key Point"),
        expectedLocal,
      },
    };
  }

  if (input.eventType === "publication.failed") {
    const publicationAttemptId = text(payload.publicationAttemptId);
    if (!publicationAttemptId) return { ok: false, code: "missing_publication_attempt" };
    const thread: PublicationAttentionThread = {
      kind: "publication",
      facilityId: input.facilityId,
      publicationAttemptId,
    };
    return {
      ok: true,
      parsed: {
        kind: "publication",
        thread,
        threadKey: publicationAttentionThreadKey(thread),
        subjectLabel: label(payload.subjectLabel, "A scheduled publication failed"),
        policyInput: { eventType: "publication.failed" },
      },
    };
  }

  if (input.eventType === "sync.conflict_detected") {
    if (typeof payload.blocksActiveOperation !== "boolean") {
      return { ok: false, code: "invalid_sync_payload" };
    }
    if (payload.syncActorUserId !== null && text(payload.syncActorUserId) == null) {
      return { ok: false, code: "invalid_sync_payload" };
    }
    return { ok: true, parsed: { kind: "sync_deferred" } };
  }

  if (!isNotificationEventType(input.eventType)) return { ok: false, code: "unknown_event" };
  if (
    input.eventType === "coverage.became_at_risk" ||
    input.eventType === "coverage.became_uncovered" ||
    input.eventType === "coverage.restored" ||
    input.eventType === "attention.reevaluate" ||
    input.eventType === "attention.expired" ||
    input.eventType === "assignment.changed" ||
    input.eventType === "publication.failed" ||
    input.eventType === "sync.conflict_detected" ||
    input.eventType === "milestone.overdue" ||
    input.eventType === "milestone.recorded" ||
    input.eventType === "milestone.deadline_moved" ||
    input.eventType === "work_order.assigned" ||
    input.eventType === "work_order.assignment_ended" ||
    input.eventType === "work_order.overdue" ||
    input.eventType === "work_order.overdue_resolved" ||
    input.eventType === "work_order.overdue_ended" ||
    input.eventType === "work_order.intervention_required" ||
    input.eventType === "work_order.intervention_cleared" ||
    input.eventType === "work_order.intervention_completed" ||
    input.eventType === "work_order.intervention_cancelled" ||
    input.eventType === "evidence.failed" ||
    input.eventType === "issue.created" ||
    input.eventType === "asset.out_of_service" ||
    input.eventType === "asset.returned_to_service" ||
    input.eventType === "asset.outage_ended"
  ) {
    return { ok: false, code: "unknown_event" };
  }
  return { ok: true, parsed: { kind: "catalog_only", eventType: input.eventType } };
}

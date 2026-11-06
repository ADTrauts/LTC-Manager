/**
 * Thread identity for one Coverage episode.
 *
 * The stored key excludes condition and priority. At Risk and Uncovered in
 * the same episode are one thread. A later episode is a new thread.
 * Breakfast and lunch stay apart because `cycleStableKey` is part of the grain.
 *
 * Other domains add their own typed builders. They must not reuse a template
 * item id, a browser clock, or this coverage grain for a different fact.
 */

export const COVERAGE_ATTENTION_THREAD_KIND = "coverage" as const;

export type CoverageAttentionThread = {
  kind: typeof COVERAGE_ATTENTION_THREAD_KIND;
  facilityId: string;
  /** Facility civil date, YYYY-MM-DD. Not a browser-local instant. */
  serviceDate: string;
  departmentId: string;
  spaceId: string;
  /** roleKey, or the Location Program team identity. Not a template item id. */
  responsibility: string;
  cycleStableKey: string;
  /** Coverage-owned episode id. Notifications do not invent this. */
  episodeId: string;
};

const SERVICE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function assertCanonicalPart(name: string, value: string): void {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`${name} must be a non-empty canonical id`);
  }
}

function assertServiceDate(value: string): void {
  assertCanonicalPart("serviceDate", value);
  const match = SERVICE_DATE.exec(value);
  if (!match) {
    throw new Error("serviceDate must be YYYY-MM-DD");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new Error("serviceDate must be a real calendar date");
  }
}

/**
 * Deterministic thread key. Array order is the contract. JSON encoding keeps
 * ids that contain separators from shifting the fields.
 */
export function coverageAttentionThreadKey(thread: CoverageAttentionThread): string {
  if (thread.kind !== COVERAGE_ATTENTION_THREAD_KIND) {
    throw new Error("coverage thread kind is required");
  }
  assertCanonicalPart("facilityId", thread.facilityId);
  assertServiceDate(thread.serviceDate);
  assertCanonicalPart("departmentId", thread.departmentId);
  assertCanonicalPart("spaceId", thread.spaceId);
  assertCanonicalPart("responsibility", thread.responsibility);
  assertCanonicalPart("cycleStableKey", thread.cycleStableKey);
  assertCanonicalPart("episodeId", thread.episodeId);
  return JSON.stringify([
    thread.kind,
    thread.facilityId,
    thread.serviceDate,
    thread.departmentId,
    thread.spaceId,
    thread.responsibility,
    thread.cycleStableKey,
    thread.episodeId,
  ]);
}

export const ASSIGNMENT_ATTENTION_THREAD_KIND = "assignment" as const;

/**
 * One attention episode per authoritative Assignment change.
 * The change is `OperationalAssignmentEvent.id`. Repeats of that same event
 * update this thread. A later event for the assignment is a new episode.
 * Service date stays on the payload. It does not collapse distinct changes.
 */
export type AssignmentAttentionThread = {
  kind: typeof ASSIGNMENT_ATTENTION_THREAD_KIND;
  facilityId: string;
  assignmentId: string;
  assignmentEventId: string;
};

export function assignmentAttentionThreadKey(thread: AssignmentAttentionThread): string {
  if (thread.kind !== ASSIGNMENT_ATTENTION_THREAD_KIND) {
    throw new Error("assignment thread kind is required");
  }
  assertCanonicalPart("facilityId", thread.facilityId);
  assertCanonicalPart("assignmentId", thread.assignmentId);
  assertCanonicalPart("assignmentEventId", thread.assignmentEventId);
  return JSON.stringify([
    thread.kind,
    thread.facilityId,
    thread.assignmentId,
    thread.assignmentEventId,
  ]);
}

export function assignmentChangeIntakeDedupeKey(assignmentEventId: string): string {
  assertCanonicalPart("assignmentEventId", assignmentEventId);
  return `assignment-event:${assignmentEventId}`;
}

export const PUBLICATION_ATTENTION_THREAD_KIND = "publication" as const;

/**
 * One thread per publication attempt, as Section 16 names it.
 * A later successful publication resolving that thread is an N3 path. It is not a Build row.
 */
export type PublicationAttentionThread = {
  kind: typeof PUBLICATION_ATTENTION_THREAD_KIND;
  facilityId: string;
  publicationAttemptId: string;
};

export const KEY_POINT_ATTENTION_THREAD_KIND = "key_point" as const;

/**
 * One thread per Key Point, location, and service date.
 * `cycleStableKey` is the Key Point. The catalog event id remains `milestone.overdue`.
 * Priority, the clock, and the scheduler run are not part of the identity.
 * Department-grain Key Points are not in this thread. They have no room occurrence.
 */
export type KeyPointAttentionThread = {
  kind: typeof KEY_POINT_ATTENTION_THREAD_KIND;
  facilityId: string;
  serviceDate: string;
  departmentId: string;
  spaceId: string;
  cycleStableKey: string;
};

export function keyPointAttentionThreadKey(thread: KeyPointAttentionThread): string {
  if (thread.kind !== KEY_POINT_ATTENTION_THREAD_KIND) {
    throw new Error("key point thread kind is required");
  }
  assertCanonicalPart("facilityId", thread.facilityId);
  assertServiceDate(thread.serviceDate);
  assertCanonicalPart("departmentId", thread.departmentId);
  assertCanonicalPart("spaceId", thread.spaceId);
  assertCanonicalPart("cycleStableKey", thread.cycleStableKey);
  return JSON.stringify([
    thread.kind,
    thread.facilityId,
    thread.serviceDate,
    thread.departmentId,
    thread.spaceId,
    thread.cycleStableKey,
  ]);
}

function keyPointIdentity(thread: Omit<KeyPointAttentionThread, "kind">): string {
  assertServiceDate(thread.serviceDate);
  assertCanonicalPart("departmentId", thread.departmentId);
  assertCanonicalPart("spaceId", thread.spaceId);
  assertCanonicalPart("cycleStableKey", thread.cycleStableKey);
  return `${thread.serviceDate}:${thread.departmentId}:${thread.spaceId}:${thread.cycleStableKey}`;
}

/** One intake per occurrence and expected minute. A later due time can open again. */
export function keyPointOverdueIntakeDedupeKey(
  thread: Omit<KeyPointAttentionThread, "kind">,
  expectedLocal: string,
): string {
  assertCanonicalPart("expectedLocal", expectedLocal);
  return `key-point-overdue:${keyPointIdentity(thread)}:${expectedLocal}`;
}

/** The actual was recorded. Resolves the overdue thread. It is not a new Update. */
export function keyPointRecordedIntakeDedupeKey(thread: Omit<KeyPointAttentionThread, "kind">): string {
  return `key-point-recorded:${keyPointIdentity(thread)}`;
}

/** The deadline moved out of the past. Ends attention without claiming the Key Point occurred. */
export function keyPointDeadlineMovedIntakeDedupeKey(
  thread: Omit<KeyPointAttentionThread, "kind">,
  expectedLocal: string,
): string {
  assertCanonicalPart("expectedLocal", expectedLocal);
  return `key-point-deadline-moved:${keyPointIdentity(thread)}:${expectedLocal}`;
}

export const WORK_ORDER_ASSIGNMENT_THREAD_KIND = "work_order_assignment" as const;

/**
 * One attention thread per authoritative Work Order assignment.
 * The identity is the Work Order history row for that change.
 * A later assignment of the same Work Order, including a return to the
 * same Employee, is a new thread. The Work Order id alone is not the thread.
 * Priority and the Work Order's own priority are not part of the identity.
 */
export type WorkOrderAssignmentThread = {
  kind: typeof WORK_ORDER_ASSIGNMENT_THREAD_KIND;
  facilityId: string;
  repairId: string;
  assignmentEventId: string;
};

export function workOrderAssignmentThreadKey(thread: WorkOrderAssignmentThread): string {
  if (thread.kind !== WORK_ORDER_ASSIGNMENT_THREAD_KIND) {
    throw new Error("work order assignment thread kind is required");
  }
  assertCanonicalPart("facilityId", thread.facilityId);
  assertCanonicalPart("repairId", thread.repairId);
  assertCanonicalPart("assignmentEventId", thread.assignmentEventId);
  return JSON.stringify([
    thread.kind,
    thread.facilityId,
    thread.repairId,
    thread.assignmentEventId,
  ]);
}

/** One intake per assignment history row. A later return to the same Employee is a new intake. */
export function workOrderAssignmentIntakeDedupeKey(assignmentEventId: string): string {
  assertCanonicalPart("assignmentEventId", assignmentEventId);
  return `work-order-assignment:${assignmentEventId}`;
}

export const ISSUE_CREATED_THREAD_KIND = "issue_created" as const;

/** One historical notice per created Issue. Impact and priority are not part of the identity. */
export type IssueCreatedThread = {
  kind: typeof ISSUE_CREATED_THREAD_KIND;
  facilityId: string;
  issueId: string;
};

export function issueCreatedThreadKey(thread: IssueCreatedThread): string {
  if (thread.kind !== ISSUE_CREATED_THREAD_KIND) {
    throw new Error("issue created thread kind is required");
  }
  assertCanonicalPart("facilityId", thread.facilityId);
  assertCanonicalPart("issueId", thread.issueId);
  return JSON.stringify([thread.kind, thread.facilityId, thread.issueId]);
}

export function issueCreatedIntakeDedupeKey(issueId: string): string {
  assertCanonicalPart("issueId", issueId);
  return `issue-created:${issueId}`;
}

export const EVIDENCE_FAILED_THREAD_KIND = "evidence_failed" as const;

/** One historical notice per submitted Record. Priority is not part of the identity. */
export type EvidenceFailedThread = {
  kind: typeof EVIDENCE_FAILED_THREAD_KIND;
  facilityId: string;
  recordId: string;
};

export function evidenceFailedThreadKey(thread: EvidenceFailedThread): string {
  if (thread.kind !== EVIDENCE_FAILED_THREAD_KIND) {
    throw new Error("evidence failed thread kind is required");
  }
  assertCanonicalPart("facilityId", thread.facilityId);
  assertCanonicalPart("recordId", thread.recordId);
  return JSON.stringify([thread.kind, thread.facilityId, thread.recordId]);
}

export const ASSET_OUT_OF_SERVICE_THREAD_KIND = "asset_out_of_service" as const;

/** One outage episode. A later outage is a new history row and a new thread. */
export type AssetOutOfServiceThread = {
  kind: typeof ASSET_OUT_OF_SERVICE_THREAD_KIND;
  facilityId: string;
  assetId: string;
  historyId: string;
};

export function assetOutOfServiceThreadKey(thread: AssetOutOfServiceThread): string {
  if (thread.kind !== ASSET_OUT_OF_SERVICE_THREAD_KIND) {
    throw new Error("asset out of service thread kind is required");
  }
  assertCanonicalPart("facilityId", thread.facilityId);
  assertCanonicalPart("assetId", thread.assetId);
  assertCanonicalPart("historyId", thread.historyId);
  return JSON.stringify([thread.kind, thread.facilityId, thread.assetId, thread.historyId]);
}

export function assetOutOfServiceIntakeDedupeKey(historyId: string): string {
  assertCanonicalPart("historyId", historyId);
  return `asset-out-of-service:${historyId}`;
}

export function assetReturnedToServiceIntakeDedupeKey(historyId: string): string {
  assertCanonicalPart("historyId", historyId);
  return `asset-returned-to-service:${historyId}`;
}

export function assetOutageEndedIntakeDedupeKey(historyId: string): string {
  assertCanonicalPart("historyId", historyId);
  return `asset-outage-ended:${historyId}`;
}

export function evidenceFailedIntakeDedupeKey(recordId: string): string {
  assertCanonicalPart("recordId", recordId);
  return `evidence-failed:${recordId}`;
}

export const WORK_ORDER_OVERDUE_THREAD_KIND = "work_order_overdue" as const;

/**
 * One overdue condition per Work Order.
 * The deadline, the Work Order priority, and the scheduler run are not the thread.
 * A deadline that moves into the future ends this thread. A later miss of the
 * new deadline reopens it. Completion resolves it and does not reopen it.
 */
export type WorkOrderOverdueThread = {
  kind: typeof WORK_ORDER_OVERDUE_THREAD_KIND;
  facilityId: string;
  repairId: string;
};

export function workOrderOverdueThreadKey(thread: WorkOrderOverdueThread): string {
  if (thread.kind !== WORK_ORDER_OVERDUE_THREAD_KIND) {
    throw new Error("work order overdue thread kind is required");
  }
  assertCanonicalPart("facilityId", thread.facilityId);
  assertCanonicalPart("repairId", thread.repairId);
  return JSON.stringify([thread.kind, thread.facilityId, thread.repairId]);
}

/**
 * One intake per Work Order and deadline instant.
 * A write that opens the same instant again, after the thread ended, adds its
 * history id so the repeat is not discarded as a duplicate.
 */
export function workOrderOverdueIntakeDedupeKey(
  repairId: string,
  dueAt: Date,
  historyEventId?: string | null,
): string {
  assertCanonicalPart("repairId", repairId);
  const base = `work-order-overdue:${repairId}:${dueAt.toISOString()}`;
  if (!historyEventId) return base;
  assertCanonicalPart("historyEventId", historyEventId);
  return `${base}:${historyEventId}`;
}

/** Recipient refresh for the same overdue condition. It does not open a second condition. */
export function workOrderOverdueAssigneeIntakeDedupeKey(
  repairId: string,
  dueAt: Date,
  assigneeEmployeeId: string | null,
): string {
  assertCanonicalPart("repairId", repairId);
  return `work-order-overdue:${repairId}:${dueAt.toISOString()}:assignee:${assigneeEmployeeId ?? "none"}`;
}

export function workOrderOverdueEndedIntakeDedupeKey(historyEventId: string): string {
  assertCanonicalPart("historyEventId", historyEventId);
  return `work-order-overdue-ended:${historyEventId}`;
}

export function workOrderOverdueResolvedIntakeDedupeKey(historyEventId: string): string {
  assertCanonicalPart("historyEventId", historyEventId);
  return `work-order-overdue-resolved:${historyEventId}`;
}

export const WORK_ORDER_INTERVENTION_THREAD_KIND = "work_order_intervention" as const;

/**
 * One immediate-response episode.
 * The opening WorkOrderResponseHistory row is the episode.
 * A later opening is a new row and a new thread.
 * Queue priority, the assignee, and the on-call responder are not the thread.
 */
export type WorkOrderInterventionThread = {
  kind: typeof WORK_ORDER_INTERVENTION_THREAD_KIND;
  facilityId: string;
  repairId: string;
  openingHistoryId: string;
};

export function workOrderInterventionThreadKey(thread: WorkOrderInterventionThread): string {
  if (thread.kind !== WORK_ORDER_INTERVENTION_THREAD_KIND) {
    throw new Error("work order intervention thread kind is required");
  }
  assertCanonicalPart("facilityId", thread.facilityId);
  assertCanonicalPart("repairId", thread.repairId);
  assertCanonicalPart("openingHistoryId", thread.openingHistoryId);
  return JSON.stringify([
    thread.kind,
    thread.facilityId,
    thread.repairId,
    thread.openingHistoryId,
  ]);
}

export function workOrderInterventionIntakeDedupeKey(openingHistoryId: string): string {
  assertCanonicalPart("openingHistoryId", openingHistoryId);
  return `work-order-intervention:${openingHistoryId}`;
}

export function workOrderInterventionClearedIntakeDedupeKey(historyId: string): string {
  assertCanonicalPart("historyId", historyId);
  return `work-order-intervention-cleared:${historyId}`;
}

export function workOrderInterventionCompletedIntakeDedupeKey(historyId: string): string {
  assertCanonicalPart("historyId", historyId);
  return `work-order-intervention-completed:${historyId}`;
}

export function workOrderInterventionCancelledIntakeDedupeKey(historyId: string): string {
  assertCanonicalPart("historyId", historyId);
  return `work-order-intervention-cancelled:${historyId}`;
}

/** Ends prior assignment attention. It does not notify anyone that the Work Order was unassigned. */
export function workOrderAssignmentEndedIntakeDedupeKey(assignmentEventId: string): string {
  assertCanonicalPart("assignmentEventId", assignmentEventId);
  return `work-order-assignment-ended:${assignmentEventId}`;
}

export function publicationAttentionThreadKey(thread: PublicationAttentionThread): string {
  if (thread.kind !== PUBLICATION_ATTENTION_THREAD_KIND) {
    throw new Error("publication thread kind is required");
  }
  assertCanonicalPart("facilityId", thread.facilityId);
  assertCanonicalPart("publicationAttemptId", thread.publicationAttemptId);
  return JSON.stringify([thread.kind, thread.facilityId, thread.publicationAttemptId]);
}

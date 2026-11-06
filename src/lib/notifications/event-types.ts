/**
 * Canonical Notifications & Attention event names.
 *
 * These are intake names only. They do not add Readiness states, and they do not
 * handle the event. `milestone.overdue` is the Key Point lateness event.
 * The product word is Key Point. `milestone` stays the stable catalog id.
 * `milestone.recorded` resolves that thread. `milestone.deadline_moved` ends it
 * when the due time moves out of the past and no actual was recorded.
 * `work_order.assigned` is one assignment of responsibility. `work_order.assignment_ended`
 * ends that attention when responsibility or the Work Order ends. It is not an
 * unassigned notice. `work_order.overdue` is the missed operational deadline.
 * `work_order.overdue_resolved` resolves that thread when the work is completed.
 * `work_order.overdue_ended` ends it when the deadline moves, is cleared, or the
 * Work Order is cancelled. Work Order priority is not that event.
 * `work_order.intervention_required` is one opening of immediate response.
 * Clearing it and cancelling the Work Order end that episode.
 * Completing the Work Order resolves it. Queue priority is not that event.
 * `asset.out_of_service` is one runtime transition to out of service.
 * `asset.returned_to_service` resolves that outage when the Asset is usable again.
 * `asset.outage_ended` ends it when the Asset is retired instead.
 * Asset criticality is not that priority. `chat.*` is reserved until the Chat domain exists.
 */

export const NOTIFICATION_EVENT_TYPES = [
  "coverage.became_at_risk",
  "coverage.became_uncovered",
  "coverage.restored",
  "attention.reevaluate",
  "attention.expired",
  "shift.called_off",
  "assignment.changed",
  "readiness.became_at_risk",
  "readiness.became_degraded",
  "readiness.restored",
  "milestone.overdue",
  "milestone.recorded",
  "milestone.deadline_moved",
  "evidence.failed",
  "corrective_action.overdue",
  "issue.created",
  "asset.out_of_service",
  "asset.returned_to_service",
  "asset.outage_ended",
  "work_order.assigned",
  "work_order.assignment_ended",
  "work_order.overdue",
  "work_order.overdue_resolved",
  "work_order.overdue_ended",
  "work_order.intervention_required",
  "work_order.intervention_cleared",
  "work_order.intervention_completed",
  "work_order.intervention_cancelled",
  "handoff.overdue",
  "sync.conflict_detected",
  "publication.failed",
  "chat.message.created",
  "chat.mention.created",
  "chat.thread_reply.created",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

const NOTIFICATION_EVENT_TYPE_SET: ReadonlySet<string> = new Set(NOTIFICATION_EVENT_TYPES);

export function isNotificationEventType(value: string): value is NotificationEventType {
  return NOTIFICATION_EVENT_TYPE_SET.has(value);
}

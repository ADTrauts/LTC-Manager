/** Lower numbers surface first in the unit workspace work queue. */
export const UNIT_WORK_QUEUE_PRIORITY = {
  INSPECTION_OVERDUE: 90,
  FAILED_LOG: 100,
  MISSED_LOG: 110,
  INSPECTION_DUE_NOW: 115,
  PENDING_LOG: 200,
  SERVERY_READY: 300,
  SERVERY_STARTED: 310,
  URGENT_REPAIR: 400,
  HIGH_REPAIR: 410,
  OTHER_REPAIR: 500,
  INSPECTION_FOLLOW_UP: 520,
  INSPECTION_UPCOMING: 540,
  AVAILABLE_INSPECTION: 550,
  SECONDARY: 600,
} as const;

/** Show upcoming scheduled inspections only within this window (ms). */
export const INSPECTION_UPCOMING_WINDOW_MS = 3 * 60 * 60 * 1000;
/** Treat as due-now from this lead time before dueAt. */
export const INSPECTION_DUE_NOW_LEAD_MS = 30 * 60 * 1000;

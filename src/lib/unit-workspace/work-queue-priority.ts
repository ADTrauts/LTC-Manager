/** Lower numbers surface first in the unit workspace work queue. */
export const UNIT_WORK_QUEUE_PRIORITY = {
  FAILED_LOG: 100,
  MISSED_LOG: 110,
  PENDING_LOG: 200,
  SERVERY_READY: 300,
  SERVERY_STARTED: 310,
  URGENT_REPAIR: 400,
  HIGH_REPAIR: 410,
  OTHER_REPAIR: 500,
  SECONDARY: 600,
} as const;

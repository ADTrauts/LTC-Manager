/**
 * Five minutes is the V1 target.
 * The urgent line is 30 minutes before service, and service itself lasts hours.
 * A tick can be late by one interval and still land inside that band.
 * This file does not register a host cron.
 *
 * The lease outlives one pass. The pass stops itself before the lease expires
 * and releases the row, so the next tick cannot start the same evaluator
 * while this pass is still writing.
 */
export const SCHEDULED_EVALUATION_CADENCE_MS = 5 * 60 * 1000;
export const SCHEDULED_EVALUATION_LEASE_MS = 6 * 60 * 1000;
export const SCHEDULED_EVALUATION_EXECUTION_BUDGET_MS = 4 * 60 * 1000;
export const SCHEDULED_EVALUATION_OVERDUE_MS = 10 * 60 * 1000;
export const SCHEDULED_EVALUATION_FACILITY_BATCH = 25;
export const COVERAGE_TIME_EPISODE_BATCH = 100;

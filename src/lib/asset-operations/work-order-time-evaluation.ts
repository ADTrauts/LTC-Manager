/**
 * Scheduled Evaluation asks whether an open Work Order passed its deadline.
 * The deadline and the overdue answer belong to the Work Order.
 */

import type { PrismaClient } from "@prisma/client";

import { readEvaluationCheckpoint, writeEvaluationCheckpoint } from "@/lib/scheduled-evaluation/continuation";
import type { ScheduledEvaluationResult } from "@/lib/scheduled-evaluation/types";

import { OPEN_WORK_ORDER_STATUSES } from "./types";
import { enqueueWorkOrderOverdue } from "./work-order-overdue-attention";
import { evaluateWorkOrderDueState } from "./work-order-due-state";

const CANDIDATE_BATCH = 100;
const SCAN_PAGES = 20;

type Db = PrismaClient;

const EMPTY: ScheduledEvaluationResult = {
  facilitiesScanned: 0,
  candidates: 0,
  transitions: 0,
  reevaluations: 0,
  failures: 0,
  outboxIds: [],
};

export async function evaluateWorkOrderOverdue(input: {
  db: Db;
  now: Date;
  facilityIds?: string[];
  control?: { deadline: Date; renew: () => Promise<boolean> };
}): Promise<ScheduledEvaluationResult> {
  const result: ScheduledEvaluationResult = { ...EMPTY, outboxIds: [] };
  const facilities = new Set<string>();
  let examined = 0;
  const checkpoint = input.facilityIds
    ? { facilityCursor: null, recordCursor: null, recordFacilityId: null }
    : await readEvaluationCheckpoint(input.db, "work-orders.overdue");
  let afterId = input.facilityIds ? null : checkpoint.facilityCursor;
  let wrapped = false;
  let lastId: string | null = afterId;

  for (let page = 0; page < SCAN_PAGES && result.transitions < CANDIDATE_BATCH; page += 1) {
    if (input.control && Date.now() >= input.control.deadline.getTime()) break;
    if (input.control && !(await input.control.renew())) break;
    const rows = await input.db.repair.findMany({
      where: {
        status: { in: OPEN_WORK_ORDER_STATUSES },
        dueAt: { lte: input.now },
        ...(afterId ? { id: { gt: afterId } } : {}),
        ...(input.facilityIds ? { unit: { facilityId: { in: [...input.facilityIds] } } } : {}),
      },
      select: {
        id: true,
        status: true,
        dueAt: true,
        assignedEmployeeId: true,
        unit: { select: { facilityId: true } },
      },
      orderBy: [{ id: "asc" }],
      take: CANDIDATE_BATCH,
    });
    if (rows.length === 0 && afterId && !wrapped && !input.facilityIds) {
      afterId = null;
      wrapped = true;
      page -= 1;
      continue;
    }
    if (rows.length === 0) break;
    examined += rows.length;
    afterId = rows.at(-1)?.id ?? afterId;
    lastId = afterId;

    const prefixes = rows.flatMap((row) =>
      row.dueAt ? [`work-order-overdue:${row.id}:${row.dueAt.toISOString()}`] : [],
    );
    const existing = prefixes.length
      ? await input.db.notificationOutbox.findMany({
          where: { OR: prefixes.map((prefix) => ({ dedupeKey: { startsWith: prefix } })) },
          select: { dedupeKey: true },
        })
      : [];
    const seen = existing.map((row) => row.dedupeKey);

    for (const row of rows) {
      if (!row.dueAt || !row.unit.facilityId) continue;
      facilities.add(row.unit.facilityId);
      result.candidates += 1;
      const prefix = `work-order-overdue:${row.id}:${row.dueAt.toISOString()}`;
      if (seen.some((key) => key.startsWith(prefix))) continue;
      if (
        evaluateWorkOrderDueState({ status: row.status, dueAt: row.dueAt, now: input.now }) !== "OVERDUE"
      ) {
        continue;
      }
      try {
        const outboxId = await input.db.$transaction((tx) =>
          enqueueWorkOrderOverdue(tx, {
            repairId: row.id,
            dueAt: row.dueAt!,
            assigneeEmployeeId: row.assignedEmployeeId,
            occurredAt: input.now,
            intake: "deadline",
          }),
        );
        result.transitions += 1;
        result.outboxIds.push(outboxId);
        if (result.transitions >= CANDIDATE_BATCH) break;
      } catch (error) {
        result.failures += 1;
        console.info(
          JSON.stringify({
            event: "scheduled_evaluation",
            evaluator: "work-orders.overdue",
            outcome: "work_order_failed",
            repairId: row.id,
            error: error instanceof Error ? error.name : "Error",
          }),
        );
      }
    }
    if (rows.length < CANDIDATE_BATCH) {
      if (!input.facilityIds) lastId = null;
      break;
    }
  }

  if (!input.facilityIds) {
    await writeEvaluationCheckpoint(input.db, "work-orders.overdue", {
      facilityCursor: lastId,
      recordCursor: null,
      recordFacilityId: null,
    });
  }

  result.facilitiesScanned = facilities.size;
  if (examined === 0) result.candidates = 0;
  return result;
}

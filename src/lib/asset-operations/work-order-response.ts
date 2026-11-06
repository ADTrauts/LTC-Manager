/**
 * Work Order response requirement.
 *
 * This is whether immediate operational response is required.
 * Repair.priority remains queue prioritization.
 * dueAt remains the deadline.
 * assignedEmployeeId remains who is doing the work.
 * An opening, a clearing, and a terminal history row publish that fact.
 * Repair.priority is not that publication.
 */

import type { Prisma, WorkOrderResponseRequirement } from "@prisma/client";

import { sessionUserIdForFk, type FacilitySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { requireWorkOrderManage, resolveAssetOperationsAuthority } from "./authority";
import { newWorkOrderCuid, type DbClient } from "./work-order-access";
import { runWorkOrderMutation } from "./work-order-assignment-attention";
import {
  enqueueWorkOrderInterventionOpened,
  enqueueWorkOrderInterventionTerminal,
} from "./work-order-intervention-attention";

type Tx = DbClient;

const TERMINAL = new Set(["COMPLETED", "CANCELLED"]);

export async function appendWorkOrderResponseHistory(
  tx: Tx,
  input: {
    repairId: string;
    fromRequirement: WorkOrderResponseRequirement | null;
    toRequirement: WorkOrderResponseRequirement;
    transition: "OPENED" | "CLEARED" | "COMPLETED" | "CANCELLED";
    changedByUserId: string | null;
    changedAt: Date;
  },
): Promise<string> {
  const row = await tx.workOrderResponseHistory.create({
    data: {
      id: newWorkOrderCuid(),
      repairId: input.repairId,
      fromRequirement: input.fromRequirement,
      toRequirement: input.toRequirement,
      transition: input.transition,
      changedByUserId: input.changedByUserId,
      changedAt: input.changedAt,
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Writes the opening episode when a Work Order is created already immediate.
 * A standard create writes nothing.
 */
export async function recordCreatedResponseRequirement(
  tx: Tx,
  input: {
    repairId: string;
    responseRequirement: WorkOrderResponseRequirement;
    changedByUserId: string | null;
    changedAt: Date;
  },
): Promise<string[]> {
  if (input.responseRequirement !== "IMMEDIATE") return [];
  const historyId = await appendWorkOrderResponseHistory(tx, {
    repairId: input.repairId,
    fromRequirement: null,
    toRequirement: "IMMEDIATE",
    transition: "OPENED",
    changedByUserId: input.changedByUserId,
    changedAt: input.changedAt,
  });
  return enqueueWorkOrderInterventionOpened(tx as Prisma.TransactionClient, {
    repairId: input.repairId,
    openingHistoryId: historyId,
    occurredAt: input.changedAt,
  });
}

/**
 * Completion and cancellation end an open immediate episode.
 * They do not change the stored classification.
 */
export async function recordWorkOrderResponseTerminal(
  tx: Tx,
  input: {
    repairId: string;
    responseRequirement: WorkOrderResponseRequirement;
    transition: "COMPLETED" | "CANCELLED";
    changedByUserId: string | null;
    changedAt: Date;
  },
): Promise<string[]> {
  if (input.responseRequirement !== "IMMEDIATE") return [];
  const latest = await tx.workOrderResponseHistory.findFirst({
    where: { repairId: input.repairId },
    orderBy: [{ changedAt: "desc" }, { id: "desc" }],
    select: { id: true, transition: true },
  });
  if (latest && latest.transition !== "OPENED") return [];
  const historyId = await appendWorkOrderResponseHistory(tx, {
    repairId: input.repairId,
    fromRequirement: "IMMEDIATE",
    toRequirement: "IMMEDIATE",
    transition: input.transition,
    changedByUserId: input.changedByUserId,
    changedAt: input.changedAt,
  });
  if (!latest) return [];
  return enqueueWorkOrderInterventionTerminal(tx as Prisma.TransactionClient, {
    repairId: input.repairId,
    openingHistoryId: latest.id,
    terminalHistoryId: historyId,
    transition: input.transition,
    occurredAt: input.changedAt,
  });
}

export async function setWorkOrderResponseRequirement(
  session: FacilitySession,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    responseRequirement: WorkOrderResponseRequirement;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
    client,
  );
  requireWorkOrderManage(authority);
  const actorUserId = sessionUserIdForFk(session);
  const now = input.now ?? new Date();

  return runWorkOrderMutation(client, async (tx) => {
    const repair = await tx.repair.findFirst({
      where: { id: input.repairId, unit: { facilityId: input.facilityId } },
    });
    if (!repair) throw new Error("Work Order not found.");
    if (TERMINAL.has(repair.status)) {
      throw new Error("A completed or cancelled Work Order response requirement cannot change.");
    }
    if (repair.responseRequirement === input.responseRequirement) {
      return { value: { repair, historyId: null as string | null }, attentionOutboxIds: [] };
    }
    const active = await tx.workOrderResponseHistory.findFirst({
      where: { repairId: repair.id },
      orderBy: [{ changedAt: "desc" }, { id: "desc" }],
      select: { id: true, transition: true },
    });
    const updated = await tx.repair.update({
      where: { id: repair.id },
      data: { responseRequirement: input.responseRequirement },
    });
    const historyId = await appendWorkOrderResponseHistory(tx, {
      repairId: repair.id,
      fromRequirement: repair.responseRequirement,
      toRequirement: input.responseRequirement,
      transition: input.responseRequirement === "IMMEDIATE" ? "OPENED" : "CLEARED",
      changedByUserId: actorUserId,
      changedAt: now,
    });
    const attentionOutboxIds =
      input.responseRequirement === "IMMEDIATE"
        ? await enqueueWorkOrderInterventionOpened(tx as Prisma.TransactionClient, {
            repairId: repair.id,
            openingHistoryId: historyId,
            occurredAt: now,
          })
        : active?.transition === "OPENED"
          ? await enqueueWorkOrderInterventionTerminal(tx as Prisma.TransactionClient, {
              repairId: repair.id,
              openingHistoryId: active.id,
              terminalHistoryId: historyId,
              transition: "CLEARED",
              occurredAt: now,
            })
          : [];
    return { value: { repair: updated, historyId }, attentionOutboxIds };
  });
}

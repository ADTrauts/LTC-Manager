import type { MealType, OperationalTemplateScheduleKind, PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { isDietaryOperationalEvidenceEnabled } from "@/lib/feature-flags";
import { submitEvidenceRecord } from "@/lib/operational-evidence";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { recordServeryMilestone, type ServeryMilestone } from "@/lib/servery";

import { resolveMilestoneActor } from "./resolve-milestone-actor";
import type {
  OfflineCommandEnvelope,
  OfflineConflictCategory,
  OfflineMilestoneProjection,
  OfflineSyncCommandResult,
  OfflineSyncResultCategory,
} from "./types";

const MILESTONE_BY_COMMAND = {
  RECORD_SERVERY_READY: "READY",
  RECORD_MEAL_SERVICE_STARTED: "SERVICE_STARTED",
} as const satisfies Record<"RECORD_SERVERY_READY" | "RECORD_MEAL_SERVICE_STARTED", ServeryMilestone>;

function safeReasonFromFailure(reason: string): string {
  return reason;
}

function milestoneProjectionFromResult(input: {
  eventId: string;
  milestone: ServeryMilestone;
  occurredAt: Date;
  recordedAt: Date;
}): OfflineMilestoneProjection {
  return {
    eventId: input.eventId,
    occurredAt: input.occurredAt.toISOString(),
    recordedAt: input.recordedAt.toISOString(),
    recordedByLabel: null,
    corrected: false,
  };
}

export type ProcessSyncCommandInput = {
  session: AppJwtPayload;
  command: OfflineCommandEnvelope;
  deviceFacilityId: string;
  deviceBoundUnitId: string | null;
  now?: Date;
};

export async function processSyncCommand(
  input: ProcessSyncCommandInput,
  client: PrismaClient = defaultPrisma,
): Promise<OfflineSyncCommandResult> {
  const now = input.now ?? new Date();
  const { command } = input;

  if (command.facilityId !== input.session.facilityId) {
    return reject(command.clientCommandId, "FACILITY_MISMATCH");
  }
  if (input.deviceFacilityId !== input.session.facilityId) {
    return reject(command.clientCommandId, "DEVICE_FACILITY_MISMATCH");
  }
  if (input.deviceBoundUnitId && input.deviceBoundUnitId !== command.unitId) {
    return reject(command.clientCommandId, "DEVICE_UNIT_CONFLICT");
  }

  if (command.commandType === "SUBMIT_OPERATIONAL_EVIDENCE") {
    return processEvidenceCommand(input, client, now);
  }

  const actor = await resolveMilestoneActor(input.session);
  const milestone =
    command.commandType === "RECORD_SERVERY_READY" ||
    command.commandType === "RECORD_MEAL_SERVICE_STARTED"
      ? MILESTONE_BY_COMMAND[command.commandType]
      : null;
  if (!milestone) {
    return reject(command.clientCommandId, "UNSUPPORTED_COMMAND");
  }

  const occurredAt = new Date(command.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    return reject(command.clientCommandId, "OCCURRENCE_TIME_INVALID");
  }

  const result = await recordServeryMilestone(
    {
      facilityId: input.session.facilityId,
      unitId: command.unitId,
      mealType: command.mealType as MealType,
      milestone,
      action: "RECORD",
      clientActionId: command.clientCommandId,
      occurredAt,
      actor,
      deviceBoundUnitId: input.deviceBoundUnitId,
      now,
    },
    client,
  );

  if (result.ok) {
    const category: OfflineSyncResultCategory = result.deduplicated ? "ALREADY_ACCEPTED" : "ACCEPTED";
    await upsertReceipt(client, input, command, category, null, result.recordedAt, result.eventId, null);
    return {
      clientCommandId: command.clientCommandId,
      category,
      reasonCode: null,
      authoritativeRecordId: result.eventId,
      serverAcceptedAt: result.recordedAt.toISOString(),
      serverRevision: null,
      retryAfterSeconds: null,
      conflictCategory: null,
      authoritativeMilestone: milestoneProjectionFromResult({
        eventId: result.eventId,
        milestone: result.milestone,
        occurredAt: result.occurredAt,
        recordedAt: result.recordedAt,
      }),
    };
  }

  if (result.reason === "ALREADY_RECORDED") {
    const conflictCategory: OfflineConflictCategory = "DUPLICATE_DIFFERENT_COMMAND";
    await upsertConflict(client, input, command, conflictCategory, result.reason);
    await upsertReceipt(
      client,
      input,
      command,
      "CONFLICT_REVIEW_REQUIRED",
      result.reason,
      null,
      null,
      null,
    );
    return {
      clientCommandId: command.clientCommandId,
      category: "CONFLICT_REVIEW_REQUIRED",
      reasonCode: safeReasonFromFailure(result.reason),
      authoritativeRecordId: null,
      serverAcceptedAt: null,
      serverRevision: null,
      retryAfterSeconds: null,
      conflictCategory,
      authoritativeMilestone: null,
    };
  }

  const retryable = result.reason === "MEAL_NOT_CONFIGURED";
  const category: OfflineSyncResultCategory = retryable ? "RETRY_REQUIRED" : "REJECTED";
  await upsertReceipt(client, input, command, category, result.reason, null, null, null);
  return {
    clientCommandId: command.clientCommandId,
    category,
    reasonCode: safeReasonFromFailure(result.reason),
    authoritativeRecordId: null,
    serverAcceptedAt: null,
    serverRevision: null,
    retryAfterSeconds: retryable ? 60 : null,
    conflictCategory: null,
    authoritativeMilestone: null,
  };
}

async function processEvidenceCommand(
  input: ProcessSyncCommandInput,
  client: PrismaClient,
  now: Date,
): Promise<OfflineSyncCommandResult> {
  const { command } = input;
  if (!isDietaryOperationalEvidenceEnabled()) {
    return reject(command.clientCommandId, "EVIDENCE_FLAG_DISABLED");
  }
  const payload = command.evidence;
  if (!payload?.templateId || !payload.requirementKey) {
    return reject(command.clientCommandId, "EVIDENCE_PAYLOAD_INVALID");
  }

  const occurredAt = new Date(command.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    return reject(command.clientCommandId, "OCCURRENCE_TIME_INVALID");
  }

  try {
    const template = await client.operationalTemplate.findFirst({
      where: {
        id: payload.templateId,
        facilityId: command.facilityId,
        departmentId: command.departmentId,
      },
      select: { id: true, version: true, status: true },
    });
    if (!template) return reject(command.clientCommandId, "TEMPLATE_NOT_FOUND");
    if (template.status === "RETIRED") return reject(command.clientCommandId, "TEMPLATE_RETIRED");
    if (template.status !== "PUBLISHED") {
      return reject(command.clientCommandId, "TEMPLATE_NOT_PUBLISHED");
    }
    if (template.version !== payload.templateVersion) {
      const conflictCategory: OfflineConflictCategory = "AUTHORITATIVE_STATE_CHANGED";
      await upsertConflict(client, input, command, conflictCategory, "TEMPLATE_VERSION_MISMATCH");
      await upsertReceipt(
        client,
        input,
        command,
        "CONFLICT_REVIEW_REQUIRED",
        "TEMPLATE_VERSION_MISMATCH",
        null,
        null,
        null,
      );
      return {
        clientCommandId: command.clientCommandId,
        category: "CONFLICT_REVIEW_REQUIRED",
        reasonCode: "TEMPLATE_VERSION_MISMATCH",
        authoritativeRecordId: null,
        serverAcceptedAt: null,
        serverRevision: null,
        retryAfterSeconds: null,
        conflictCategory,
        authoritativeMilestone: null,
      };
    }

    const actor = await resolveMilestoneActor(input.session);
    const record = await submitEvidenceRecord(input.session, {
      facilityId: command.facilityId,
      departmentId: command.departmentId,
      templateId: payload.templateId,
      requirementKey: payload.requirementKey,
      operationalDateKey: command.operationalDate,
      scheduleKind: payload.scheduleKind as OperationalTemplateScheduleKind,
      cycleStableKey: payload.cycleStableKey,
      cycleLabel: payload.cycleLabel,
      windowStartLocal: payload.windowStartLocal,
      windowEndLocal: payload.windowEndLocal,
      unitId: command.unitId,
      spaceId: payload.spaceId,
      assetId: payload.assetId,
      occurredAt,
      recordedOnline: false,
      clientCommandId: command.clientCommandId,
      deviceBoundUnitId: input.deviceBoundUnitId,
      recordedByEmployeeId: actor.employeeId,
      recordedByLabel: input.session.name || input.session.email || null,
      correctiveActionText: payload.correctiveActionText,
      values: payload.values,
      now,
      client,
    });

    const synchronizedAt = record.synchronizedAt ?? now;
    if (!record.synchronizedAt) {
      await client.operationalEvidenceRecord.update({
        where: { id: record.id },
        data: { synchronizedAt },
      });
    }

    const category: OfflineSyncResultCategory = "ACCEPTED";
    await upsertReceipt(
      client,
      input,
      command,
      category,
      null,
      synchronizedAt,
      null,
      record.id,
    );

    return {
      clientCommandId: command.clientCommandId,
      category,
      reasonCode: null,
      authoritativeRecordId: record.id,
      serverAcceptedAt: synchronizedAt.toISOString(),
      serverRevision: null,
      retryAfterSeconds: null,
      conflictCategory: null,
      authoritativeMilestone: null,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "EVIDENCE_SUBMIT_FAILED";
    await upsertReceipt(client, input, command, "REJECTED", reason, null, null, null);
    return reject(command.clientCommandId, reason);
  }
}

function reject(clientCommandId: string, reasonCode: string): OfflineSyncCommandResult {
  return {
    clientCommandId,
    category: "REJECTED",
    reasonCode,
    authoritativeRecordId: null,
    serverAcceptedAt: null,
    serverRevision: null,
    retryAfterSeconds: null,
    conflictCategory: null,
    authoritativeMilestone: null,
  };
}

async function upsertReceipt(
  client: PrismaClient,
  input: ProcessSyncCommandInput,
  command: OfflineCommandEnvelope,
  resultCategory: OfflineSyncResultCategory,
  reasonCode: string | null,
  serverAcceptedAt: Date | null,
  milestoneEntryId: string | null,
  evidenceRecordId: string | null,
) {
  const actor = await resolveMilestoneActor(input.session);
  await client.offlineSyncReceipt.upsert({
    where: {
      facilityId_unitId_clientCommandId: {
        facilityId: input.session.facilityId,
        unitId: command.unitId,
        clientCommandId: command.clientCommandId,
      },
    },
    create: {
      facilityId: input.session.facilityId,
      unitId: command.unitId,
      clientCommandId: command.clientCommandId,
      commandType: command.commandType,
      resultCategory,
      reasonCode,
      actorUserId: actor.userId,
      actorEmployeeId: actor.employeeId,
      sessionVersion: input.session.sessionVersion ?? 0,
      deviceBoundUnitId: input.deviceBoundUnitId,
      locallyRecordedAt: new Date(command.locallyRecordedAt),
      serverAcceptedAt,
      milestoneEntryId,
      evidenceRecordId,
    },
    update: {
      resultCategory,
      reasonCode,
      serverAcceptedAt,
      milestoneEntryId,
      evidenceRecordId,
    },
  });
}

async function upsertConflict(
  client: PrismaClient,
  input: ProcessSyncCommandInput,
  command: OfflineCommandEnvelope,
  conflictCategory: OfflineConflictCategory,
  reasonCode: string,
) {
  await client.offlineConflict.upsert({
    where: {
      facilityId_unitId_clientCommandId: {
        facilityId: input.session.facilityId,
        unitId: command.unitId,
        clientCommandId: command.clientCommandId,
      },
    },
    create: {
      facilityId: input.session.facilityId,
      unitId: command.unitId,
      clientCommandId: command.clientCommandId,
      conflictCategory,
      commandPayload: command,
      authoritativeState: {},
      reasonCode,
    },
    update: {
      conflictCategory,
      reasonCode,
    },
  });
}

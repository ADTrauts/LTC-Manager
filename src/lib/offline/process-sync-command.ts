import type { MealType, PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { recordServeryMilestone, type ServeryMilestone } from "@/lib/servery";

import { resolveMilestoneActor } from "./resolve-milestone-actor";
import type {
  OfflineCommandEnvelope,
  OfflineCommandType,
  OfflineConflictCategory,
  OfflineMilestoneProjection,
  OfflineSyncCommandResult,
  OfflineSyncResultCategory,
} from "./types";

const MILESTONE_BY_COMMAND: Record<OfflineCommandType, ServeryMilestone> = {
  RECORD_SERVERY_READY: "READY",
  RECORD_MEAL_SERVICE_STARTED: "SERVICE_STARTED",
};

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

  const actor = await resolveMilestoneActor(input.session);
  const milestone = MILESTONE_BY_COMMAND[command.commandType];
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
    await upsertReceipt(client, input, command, category, null, result.recordedAt, result.eventId);
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
    await upsertReceipt(client, input, command, "CONFLICT_REVIEW_REQUIRED", result.reason, null, null);
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
  await upsertReceipt(client, input, command, category, result.reason, null, null);
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
    },
    update: {
      resultCategory,
      reasonCode,
      serverAcceptedAt,
      milestoneEntryId,
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

import { Prisma, type AiBriefStatus, type AiBriefType, type PrismaClient } from "@prisma/client";

import type { OperationalSnapshot } from "@/lib/ai/operational-snapshot/types";
import type { MorningBriefResult } from "@/lib/ai/types";

import type {
  BriefCacheLookup,
  BriefCacheRecord,
  BriefCacheWrite,
  MorningBriefCacheStore,
} from "./cache-store";

function mapRow(row: {
  id: string;
  facilityId: string;
  departmentKey: string;
  serviceDate: Date;
  briefType: AiBriefType;
  operationInstanceId: string | null;
  snapshotHash: string;
  snapshotJson: unknown;
  baselineSnapshotHash: string | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  resultJson: unknown;
  provider: string;
  model: string;
  status: AiBriefStatus;
  promptVersion: string;
  latencyMs: number | null;
  errorCode: string | null;
  generatedAt: Date;
  expiresAt: Date;
}): BriefCacheRecord {
  return {
    id: row.id,
    facilityId: row.facilityId,
    departmentKey: row.departmentKey,
    serviceDate: row.serviceDate,
    briefType: row.briefType,
    operationInstanceId: row.operationInstanceId,
    snapshotHash: row.snapshotHash,
    snapshotJson: (row.snapshotJson as OperationalSnapshot | null) ?? null,
    baselineSnapshotHash: row.baselineSnapshotHash,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    resultJson: row.resultJson as MorningBriefResult,
    provider: row.provider,
    model: row.model,
    status: row.status,
    promptVersion: row.promptVersion,
    latencyMs: row.latencyMs,
    errorCode: row.errorCode,
    generatedAt: row.generatedAt,
    expiresAt: row.expiresAt,
  };
}

export function createPrismaBriefCacheStore(db: PrismaClient): MorningBriefCacheStore {
  return {
    async findLatest(lookup: BriefCacheLookup) {
      const row = await db.aiOperationalBrief.findFirst({
        where: {
          facilityId: lookup.facilityId,
          departmentKey: lookup.departmentKey,
          serviceDate: lookup.serviceDate,
          ...(lookup.briefType ? { briefType: lookup.briefType } : {}),
          ...(lookup.snapshotHash ? { snapshotHash: lookup.snapshotHash } : {}),
          expiresAt: { gt: new Date() },
        },
        orderBy: { generatedAt: "desc" },
      });
      return row ? mapRow(row) : null;
    },
    async findByHash(lookup) {
      const row = await db.aiOperationalBrief.findUnique({
        where: {
          facilityId_departmentKey_serviceDate_briefType_snapshotHash: {
            facilityId: lookup.facilityId,
            departmentKey: lookup.departmentKey,
            serviceDate: lookup.serviceDate,
            briefType: lookup.briefType,
            snapshotHash: lookup.snapshotHash,
          },
        },
      });
      if (!row || row.expiresAt.getTime() <= Date.now()) return null;
      return mapRow(row);
    },
    async countGeneratedToday(facilityId, serviceDate, briefType) {
      return db.aiOperationalBrief.count({
        where: {
          facilityId,
          serviceDate,
          status: "READY",
          ...(briefType ? { briefType } : {}),
        },
      });
    },
    async findMostRecentAny(facilityId, departmentKey, serviceDate, briefType, operationInstanceId) {
      const row = await db.aiOperationalBrief.findFirst({
        where: {
          facilityId,
          departmentKey,
          serviceDate,
          ...(briefType ? { briefType } : {}),
          ...(operationInstanceId ? { operationInstanceId } : {}),
        },
        orderBy: { generatedAt: "desc" },
      });
      return row ? mapRow(row) : null;
    },
    async findBaselineSnapshot(input) {
      const earliest = new Date(input.now.getTime() - input.lookbackMs);
      const row = await db.aiOperationalBrief.findFirst({
        where: {
          facilityId: input.facilityId,
          departmentKey: input.departmentKey,
          snapshotJson: { not: Prisma.DbNull },
          generatedAt: { gte: earliest, lt: input.now },
          ...(input.excludeSnapshotHash
            ? { snapshotHash: { not: input.excludeSnapshotHash } }
            : {}),
        },
        orderBy: { generatedAt: "desc" },
      });
      return row ? mapRow(row) : null;
    },
    async upsert(record: BriefCacheWrite) {
      const row = await db.aiOperationalBrief.upsert({
        where: {
          facilityId_departmentKey_serviceDate_briefType_snapshotHash: {
            facilityId: record.facilityId,
            departmentKey: record.departmentKey,
            serviceDate: record.serviceDate,
            briefType: record.briefType,
            snapshotHash: record.snapshotHash,
          },
        },
        create: {
          facilityId: record.facilityId,
          departmentKey: record.departmentKey,
          serviceDate: record.serviceDate,
          briefType: record.briefType,
          operationInstanceId: record.operationInstanceId,
          snapshotHash: record.snapshotHash,
          snapshotJson: (record.snapshotJson as Prisma.InputJsonValue | undefined) ?? undefined,
          baselineSnapshotHash: record.baselineSnapshotHash,
          windowStart: record.windowStart,
          windowEnd: record.windowEnd,
          resultJson: record.resultJson as Prisma.InputJsonValue,
          provider: record.provider,
          model: record.model,
          status: record.status,
          promptVersion: record.promptVersion,
          latencyMs: record.latencyMs,
          errorCode: record.errorCode,
          generatedAt: record.generatedAt,
          expiresAt: record.expiresAt,
        },
        update: {
          snapshotJson: (record.snapshotJson as Prisma.InputJsonValue | undefined) ?? undefined,
          baselineSnapshotHash: record.baselineSnapshotHash,
          windowStart: record.windowStart,
          windowEnd: record.windowEnd,
          resultJson: record.resultJson as Prisma.InputJsonValue,
          provider: record.provider,
          model: record.model,
          status: record.status,
          promptVersion: record.promptVersion,
          latencyMs: record.latencyMs,
          errorCode: record.errorCode,
          generatedAt: record.generatedAt,
          expiresAt: record.expiresAt,
          operationInstanceId: record.operationInstanceId,
        },
      });
      return mapRow(row);
    },
  };
}

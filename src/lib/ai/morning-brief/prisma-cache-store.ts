import type { AiBriefStatus, PrismaClient } from "@prisma/client";

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
  operationInstanceId: string | null;
  snapshotHash: string;
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
    operationInstanceId: row.operationInstanceId,
    snapshotHash: row.snapshotHash,
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
          facilityId_departmentKey_serviceDate_snapshotHash: {
            facilityId: lookup.facilityId,
            departmentKey: lookup.departmentKey,
            serviceDate: lookup.serviceDate,
            snapshotHash: lookup.snapshotHash,
          },
        },
      });
      if (!row || row.expiresAt.getTime() <= Date.now()) return null;
      return mapRow(row);
    },
    async countGeneratedToday(facilityId, serviceDate) {
      return db.aiOperationalBrief.count({
        where: {
          facilityId,
          serviceDate,
          status: "READY",
        },
      });
    },
    async findMostRecentAny(facilityId, departmentKey, serviceDate) {
      const row = await db.aiOperationalBrief.findFirst({
        where: { facilityId, departmentKey, serviceDate },
        orderBy: { generatedAt: "desc" },
      });
      return row ? mapRow(row) : null;
    },
    async upsert(record: BriefCacheWrite) {
      const row = await db.aiOperationalBrief.upsert({
        where: {
          facilityId_departmentKey_serviceDate_snapshotHash: {
            facilityId: record.facilityId,
            departmentKey: record.departmentKey,
            serviceDate: record.serviceDate,
            snapshotHash: record.snapshotHash,
          },
        },
        create: {
          facilityId: record.facilityId,
          departmentKey: record.departmentKey,
          serviceDate: record.serviceDate,
          operationInstanceId: record.operationInstanceId,
          snapshotHash: record.snapshotHash,
          resultJson: record.resultJson,
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
          resultJson: record.resultJson,
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

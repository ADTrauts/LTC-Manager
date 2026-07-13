import type { AiBriefStatus, AiBriefType } from "@prisma/client";

import type { OperationalSnapshot } from "@/lib/ai/operational-snapshot/types";
import type { MorningBriefResult } from "@/lib/ai/types";

export type BriefCacheRecord = {
  id: string;
  facilityId: string;
  departmentKey: string;
  serviceDate: Date;
  briefType: AiBriefType;
  operationInstanceId: string | null;
  snapshotHash: string;
  snapshotJson: OperationalSnapshot | null;
  baselineSnapshotHash: string | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  resultJson: MorningBriefResult | Record<string, unknown>;
  provider: string;
  model: string;
  status: AiBriefStatus;
  promptVersion: string;
  latencyMs: number | null;
  errorCode: string | null;
  generatedAt: Date;
  expiresAt: Date;
};

export type BriefCacheLookup = {
  facilityId: string;
  departmentKey: string;
  serviceDate: Date;
  briefType?: AiBriefType;
  snapshotHash?: string;
};

export type BriefCacheWrite = Omit<BriefCacheRecord, "id">;

export type MorningBriefCacheStore = {
  findLatest(lookup: BriefCacheLookup): Promise<BriefCacheRecord | null>;
  findByHash(
    lookup: BriefCacheLookup & { snapshotHash: string; briefType: AiBriefType },
  ): Promise<BriefCacheRecord | null>;
  countGeneratedToday(
    facilityId: string,
    serviceDate: Date,
    briefType?: AiBriefType,
  ): Promise<number>;
  findMostRecentAny(
    facilityId: string,
    departmentKey: string,
    serviceDate: Date,
    briefType?: AiBriefType,
  ): Promise<BriefCacheRecord | null>;
  /** Prior snapshot with snapshotJson for baseline diffs (lookback window). */
  findBaselineSnapshot(input: {
    facilityId: string;
    departmentKey: string;
    now: Date;
    lookbackMs: number;
    excludeSnapshotHash?: string;
  }): Promise<BriefCacheRecord | null>;
  upsert(record: BriefCacheWrite): Promise<BriefCacheRecord>;
};

function serviceDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function matchesType(row: BriefCacheRecord, briefType?: AiBriefType): boolean {
  if (!briefType) return true;
  return row.briefType === briefType;
}

/** In-memory store for tests / local fallback when DB unavailable. */
export function createMemoryBriefCacheStore(): MorningBriefCacheStore {
  const rows: BriefCacheRecord[] = [];
  let seq = 0;

  return {
    async findLatest(lookup) {
      const matches = rows
        .filter(
          (r) =>
            r.facilityId === lookup.facilityId &&
            r.departmentKey === lookup.departmentKey &&
            serviceDateKey(r.serviceDate) === serviceDateKey(lookup.serviceDate) &&
            matchesType(r, lookup.briefType) &&
            (!lookup.snapshotHash || r.snapshotHash === lookup.snapshotHash),
        )
        .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
      return matches[0] ?? null;
    },
    async findByHash(lookup) {
      return (
        rows.find(
          (r) =>
            r.facilityId === lookup.facilityId &&
            r.departmentKey === lookup.departmentKey &&
            serviceDateKey(r.serviceDate) === serviceDateKey(lookup.serviceDate) &&
            r.briefType === lookup.briefType &&
            r.snapshotHash === lookup.snapshotHash,
        ) ?? null
      );
    },
    async countGeneratedToday(facilityId, serviceDate, briefType) {
      return rows.filter(
        (r) =>
          r.facilityId === facilityId &&
          serviceDateKey(r.serviceDate) === serviceDateKey(serviceDate) &&
          r.status === "READY" &&
          matchesType(r, briefType),
      ).length;
    },
    async findMostRecentAny(facilityId, departmentKey, serviceDate, briefType) {
      const matches = rows
        .filter(
          (r) =>
            r.facilityId === facilityId &&
            r.departmentKey === departmentKey &&
            serviceDateKey(r.serviceDate) === serviceDateKey(serviceDate) &&
            matchesType(r, briefType),
        )
        .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
      return matches[0] ?? null;
    },
    async findBaselineSnapshot(input) {
      const earliest = input.now.getTime() - input.lookbackMs;
      const matches = rows
        .filter(
          (r) =>
            r.facilityId === input.facilityId &&
            r.departmentKey === input.departmentKey &&
            r.snapshotJson != null &&
            r.generatedAt.getTime() >= earliest &&
            r.generatedAt.getTime() < input.now.getTime() &&
            r.snapshotHash !== input.excludeSnapshotHash,
        )
        .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
      return matches[0] ?? null;
    },
    async upsert(record) {
      const existingIdx = rows.findIndex(
        (r) =>
          r.facilityId === record.facilityId &&
          r.departmentKey === record.departmentKey &&
          serviceDateKey(r.serviceDate) === serviceDateKey(record.serviceDate) &&
          r.briefType === record.briefType &&
          r.snapshotHash === record.snapshotHash,
      );
      const id = existingIdx >= 0 ? rows[existingIdx]!.id : `mem-${++seq}`;
      const saved: BriefCacheRecord = { ...record, id };
      if (existingIdx >= 0) rows[existingIdx] = saved;
      else rows.push(saved);
      return saved;
    },
  };
}

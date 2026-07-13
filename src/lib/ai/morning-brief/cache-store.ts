import type { AiBriefStatus } from "@prisma/client";

import type { MorningBriefResult } from "@/lib/ai/types";

export type BriefCacheRecord = {
  id: string;
  facilityId: string;
  departmentKey: string;
  serviceDate: Date;
  operationInstanceId: string | null;
  snapshotHash: string;
  resultJson: MorningBriefResult;
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
  snapshotHash?: string;
};

export type BriefCacheWrite = Omit<BriefCacheRecord, "id">;

export type MorningBriefCacheStore = {
  findLatest(lookup: BriefCacheLookup): Promise<BriefCacheRecord | null>;
  findByHash(lookup: BriefCacheLookup & { snapshotHash: string }): Promise<BriefCacheRecord | null>;
  countGeneratedToday(facilityId: string, serviceDate: Date): Promise<number>;
  findMostRecentAny(facilityId: string, departmentKey: string, serviceDate: Date): Promise<BriefCacheRecord | null>;
  upsert(record: BriefCacheWrite): Promise<BriefCacheRecord>;
};

function serviceDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
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
            r.snapshotHash === lookup.snapshotHash,
        ) ?? null
      );
    },
    async countGeneratedToday(facilityId, serviceDate) {
      return rows.filter(
        (r) =>
          r.facilityId === facilityId &&
          serviceDateKey(r.serviceDate) === serviceDateKey(serviceDate) &&
          r.status === "READY",
      ).length;
    },
    async findMostRecentAny(facilityId, departmentKey, serviceDate) {
      const matches = rows
        .filter(
          (r) =>
            r.facilityId === facilityId &&
            r.departmentKey === departmentKey &&
            serviceDateKey(r.serviceDate) === serviceDateKey(serviceDate),
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

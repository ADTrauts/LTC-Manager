import type { Prisma } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import {
  requireEvidenceLogBook,
  resolveEvidenceAuthority,
} from "./evidence-authority";
import type { EvidenceLogBookFilters } from "./types";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function clampPage(page: number | undefined): number {
  if (page == null || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

function clampPageSize(pageSize: number | undefined): number {
  if (pageSize == null || !Number.isFinite(pageSize) || pageSize < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(MAX_PAGE_SIZE, Math.floor(pageSize));
}

/**
 * Search durable Evidence Records for the Log Book.
 * STAFF/LEAD (canViewOwn only) are limited to their own records.
 */
export async function searchEvidenceRecords(
  session: AppJwtPayload,
  filters: EvidenceLogBookFilters,
) {
  const authority = await resolveEvidenceAuthority(
    session,
    filters.facilityId,
    filters.departmentId,
  );
  requireEvidenceLogBook(authority);

  const page = clampPage(filters.page);
  const pageSize = clampPageSize(filters.pageSize);
  const skip = (page - 1) * pageSize;

  const where: Prisma.OperationalEvidenceRecordWhereInput = {
    facilityId: filters.facilityId,
    departmentId: filters.departmentId,
  };

  if (filters.dateFromKey || filters.dateToKey) {
    where.operationalDate = {};
    if (filters.dateFromKey) {
      where.operationalDate.gte = facilityLocalDateToServiceDate(filters.dateFromKey);
    }
    if (filters.dateToKey) {
      where.operationalDate.lte = facilityLocalDateToServiceDate(filters.dateToKey);
    }
  }

  if (filters.unitId) where.unitId = filters.unitId;
  if (filters.assetId) where.assetId = filters.assetId;
  if (filters.spaceId) where.spaceId = filters.spaceId;
  if (filters.templateStableKey) where.templateStableKey = filters.templateStableKey;
  if (filters.purposeType) where.purposeType = filters.purposeType;
  if (filters.status) where.status = filters.status;
  if (filters.recordedOnline != null) where.recordedOnline = filters.recordedOnline;
  if (filters.correctiveOnly) {
    where.OR = [
      { outOfStandard: true },
      { correctiveActionText: { not: null } },
      { status: "COMPLETED_WITH_CORRECTIVE_ACTION" },
    ];
  }
  if (filters.correctedOnly) {
    where.corrections = { some: {} };
  }

  if (!authority.canViewLogBook) {
    // Own-only: match by employee id when present, else user id.
    const ownOr: Prisma.OperationalEvidenceRecordWhereInput[] = [];
    if (filters.recordedByEmployeeId) {
      ownOr.push({ recordedByEmployeeId: filters.recordedByEmployeeId });
    }
    if (session.authKind === "employee" && session.uid) {
      ownOr.push({ recordedByEmployeeId: session.uid });
    }
    const userId = sessionUserIdForFk(session);
    if (userId) {
      ownOr.push({ recordedByUserId: userId });
    }
    if (ownOr.length === 0) {
      return {
        records: [],
        total: 0,
        page,
        pageSize,
        canViewDepartment: false,
        canCorrect: authority.canCorrect,
      };
    }
    where.AND = [{ OR: ownOr }];
  } else if (filters.recordedByEmployeeId) {
    where.recordedByEmployeeId = filters.recordedByEmployeeId;
  }

  const [total, records] = await Promise.all([
    prisma.operationalEvidenceRecord.count({ where }),
    prisma.operationalEvidenceRecord.findMany({
      where,
      include: {
        values: { orderBy: { fieldKey: "asc" } },
        _count: { select: { corrections: true } },
      },
      orderBy: [{ operationalDate: "desc" }, { recordedAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
    }),
  ]);

  return {
    records,
    total,
    page,
    pageSize,
    canViewDepartment: authority.canViewLogBook,
    canCorrect: authority.canCorrect,
  };
}

/**
 * Load one Evidence Record with field values and append-preserving corrections history.
 */
export async function loadEvidenceRecordDetail(input: {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  recordId: string;
}) {
  const authority = await resolveEvidenceAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  requireEvidenceLogBook(authority);

  const record = await prisma.operationalEvidenceRecord.findFirst({
    where: {
      id: input.recordId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: {
      values: { orderBy: { fieldKey: "asc" } },
      corrections: { orderBy: { createdAt: "desc" } },
      template: {
        select: {
          id: true,
          stableKey: true,
          version: true,
          name: true,
          status: true,
        },
      },
    },
  });
  if (!record) throw new Error("Evidence record not found.");

  if (!authority.canViewLogBook) {
    const userId = sessionUserIdForFk(input.session);
    const isOwn =
      (input.session.authKind === "employee" &&
        record.recordedByEmployeeId === input.session.uid) ||
      (userId != null && record.recordedByUserId === userId);
    if (!isOwn) {
      throw new Error("Insufficient Operational Evidence Log Book authority.");
    }
  }

  return {
    record,
    canCorrect: authority.canCorrect,
    canViewDepartment: authority.canViewLogBook,
  };
}

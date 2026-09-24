/**
 * Non-operational Workspace extras. Not location truth.
 * Morning-brief callers stay separate. This only loads recent activity.
 */

import {
  buildOperationalTimeContext,
  loadFacilityTimezone,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

export type WorkspaceActivityRaw = {
  repairsOpened: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    unitName: string;
    departmentKey: string | null;
    at: Date;
  }>;
  repairsResolved: Array<{
    id: string;
    title: string;
    priority: string;
    unitName: string;
    departmentKey: string | null;
    at: Date;
  }>;
  inspectionsCompleted: Array<{
    id: string;
    title: string;
    result: string;
    unitName: string | null;
    departmentKey: string | null;
    at: Date;
  }>;
  knowledgePublished: Array<{
    id: string;
    title: string;
    category: string;
    departmentKey: string | null;
    at: Date;
  }>;
};

export type WorkspaceNonOperationalExtras = {
  facilityTimezone: string;
  now: Date;
  operationalTime: ReturnType<typeof buildOperationalTimeContext>;
  activity: WorkspaceActivityRaw;
};

export async function loadWorkspaceNonOperationalExtras(input: {
  facilityId: string;
}): Promise<WorkspaceNonOperationalExtras> {
  const now = new Date();
  const facilityTimezone = await loadFacilityTimezone(prisma, input.facilityId);
  const operationalTime = buildOperationalTimeContext({ now, facilityTimezone });
  const lookback = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [repairsOpened, repairsResolved, inspectionsCompleted, knowledgePublished] =
    await Promise.all([
      prisma.repair.findMany({
        where: {
          unit: { facilityId: input.facilityId },
          createdAt: { gte: lookback },
          priority: { in: ["HIGH", "URGENT"] },
        },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          title: true,
          priority: true,
          status: true,
          createdAt: true,
          unit: { select: { name: true } },
          responsibleDepartment: { select: { key: true } },
        },
      }),
      prisma.repair.findMany({
        where: {
          unit: { facilityId: input.facilityId },
          status: "CLOSED",
          updatedAt: { gte: lookback },
          priority: { in: ["HIGH", "URGENT", "MEDIUM"] },
        },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: {
          id: true,
          title: true,
          priority: true,
          updatedAt: true,
          unit: { select: { name: true } },
          responsibleDepartment: { select: { key: true } },
        },
      }),
      prisma.inspectionSubmission.findMany({
        where: {
          facilityId: input.facilityId,
          submittedAt: { gte: lookback },
        },
        orderBy: { submittedAt: "desc" },
        take: 6,
        select: {
          id: true,
          result: true,
          submittedAt: true,
          definition: { select: { name: true, department: { select: { key: true } } } },
          unit: { select: { name: true } },
        },
      }),
      prisma.knowledgeArticle.findMany({
        where: {
          facilityId: input.facilityId,
          status: "PUBLISHED",
          updatedAt: { gte: lookback },
        },
        orderBy: { updatedAt: "desc" },
        take: 4,
        select: {
          id: true,
          title: true,
          category: true,
          updatedAt: true,
          department: { select: { key: true } },
        },
      }),
    ]);

  return {
    facilityTimezone,
    now,
    operationalTime,
    activity: {
      repairsOpened: repairsOpened.map((row) => ({
        id: row.id,
        title: row.title,
        priority: row.priority,
        status: row.status,
        unitName: row.unit.name,
        departmentKey: row.responsibleDepartment?.key ?? null,
        at: row.createdAt,
      })),
      repairsResolved: repairsResolved.map((row) => ({
        id: row.id,
        title: row.title,
        priority: row.priority,
        unitName: row.unit.name,
        departmentKey: row.responsibleDepartment?.key ?? null,
        at: row.updatedAt,
      })),
      inspectionsCompleted: inspectionsCompleted.map((row) => ({
        id: row.id,
        title: row.definition.name,
        result: String(row.result),
        unitName: row.unit?.name ?? null,
        departmentKey: row.definition.department?.key ?? null,
        at: row.submittedAt,
      })),
      knowledgePublished: knowledgePublished.map((row) => ({
        id: row.id,
        title: row.title,
        category: String(row.category),
        departmentKey: row.department?.key ?? null,
        at: row.updatedAt,
      })),
    },
  };
}

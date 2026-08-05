import type { OperationalAssignmentPlanStatus, Prisma, PrismaClient } from "@prisma/client";
import { facilityLocalDateToServiceDate, toServiceDateKey } from "@/lib/operational-time";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type AssignmentPlanView = {
  id: string;
  facilityId: string;
  departmentId: string;
  serviceDate: string;
  status: OperationalAssignmentPlanStatus;
  confirmedByName: string | null;
  confirmedAt: string | null;
  reopenedByName: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  lastChangedAt: string | null;
  coverageAcknowledgedAt: string | null;
};

/** Ensure a daily plan row exists (DRAFT by default). */
export async function ensureAssignmentPlan(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    serviceDateKey: string;
    actorUserId: string | null;
  },
) {
  const serviceDate = facilityLocalDateToServiceDate(input.serviceDateKey);
  const existing = await client.operationalAssignmentPlan.findUnique({
    where: {
      facilityId_departmentId_serviceDate: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate,
      },
    },
  });
  if (existing) return existing;

  return client.operationalAssignmentPlan.create({
    data: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate,
      status: "DRAFT",
      lastChangedByUserId: input.actorUserId,
      lastChangedAt: new Date(),
    },
  });
}

export async function loadAssignmentPlanView(
  client: DbClient,
  input: { facilityId: string; departmentId: string; serviceDateKey: string },
): Promise<AssignmentPlanView | null> {
  const serviceDate = facilityLocalDateToServiceDate(input.serviceDateKey);
  const plan = await client.operationalAssignmentPlan.findUnique({
    where: {
      facilityId_departmentId_serviceDate: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate,
      },
    },
    select: {
      id: true,
      facilityId: true,
      departmentId: true,
      serviceDate: true,
      status: true,
      confirmedAt: true,
      reopenedAt: true,
      reopenReason: true,
      lastChangedAt: true,
      coverageAcknowledgedAt: true,
      confirmedByUser: { select: { displayName: true } },
      reopenedByUser: { select: { displayName: true } },
    },
  });
  if (!plan) return null;
  return {
    id: plan.id,
    facilityId: plan.facilityId,
    departmentId: plan.departmentId,
    serviceDate: toServiceDateKey(plan.serviceDate),
    status: plan.status,
    confirmedByName: plan.confirmedByUser?.displayName ?? null,
    confirmedAt: plan.confirmedAt?.toISOString() ?? null,
    reopenedByName: plan.reopenedByUser?.displayName ?? null,
    reopenedAt: plan.reopenedAt?.toISOString() ?? null,
    reopenReason: plan.reopenReason,
    lastChangedAt: plan.lastChangedAt?.toISOString() ?? null,
    coverageAcknowledgedAt: plan.coverageAcknowledgedAt?.toISOString() ?? null,
  };
}

/** Frontline employees see Assignments only when the plan is confirmed, reopened, or closed. */
export function isPlanFrontlineVisible(status: OperationalAssignmentPlanStatus | null | undefined): boolean {
  return status === "CONFIRMED" || status === "REOPENED" || status === "CLOSED";
}

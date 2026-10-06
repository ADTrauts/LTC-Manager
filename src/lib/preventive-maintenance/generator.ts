/**
 * Preventive Maintenance occurrence materialization + Work Order generation.
 *
 * Deterministic, idempotent, concurrency-safe. Does not pre-materialize a year
 * of occurrences. Creates a durable row only when Facility today is on or after
 * scheduledDate - generationLeadDays for the governing Plan Version.
 *
 * Unique (planId, scheduledDate) is the occurrence idempotency boundary.
 * Unique active Repair.pmOccurrenceId is the Work Order concurrency boundary.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { isPmActiveWorkOrderStatus } from "./active-work-order";
import { facilityCivilToday, parseCivilDate } from "./civil-date";
import { isPmPlanGenerationEligible } from "./eligibility";
import { projectEligiblePmMaterializationDates } from "./schedule";
import { civilDateToUtcMidnight } from "./civil-date";
import {
  createPreventiveWorkOrderForOccurrence,
  PmWorkOrderConfigurationError,
} from "./work-order-create";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type PmGeneratorConfigurationError = {
  facilityId: string;
  planId?: string;
  occurrenceId?: string;
  code: string;
  message: string;
};

export type PmGeneratorResult = {
  facilitiesProcessed: number;
  plansProcessed: number;
  occurrencesCreated: number;
  workOrdersCreated: number;
  skippedIneligible: number;
  configurationErrors: PmGeneratorConfigurationError[];
};

function emptyResult(): PmGeneratorResult {
  return {
    facilitiesProcessed: 0,
    plansProcessed: 0,
    occurrencesCreated: 0,
    workOrdersCreated: 0,
    skippedIneligible: 0,
    configurationErrors: [],
  };
}

function isUniqueConflict(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function materializeMissingOccurrences(
  client: DbClient,
  plan: {
    id: string;
    versions: Array<{
      id: string;
      status: string;
      effectiveDate: Date | null;
      intervalMonths: number;
      anchorDate: Date;
      generationLeadDays: number;
    }>;
  },
  facilityToday: string,
): Promise<number> {
  const eligible = projectEligiblePmMaterializationDates(plan.versions, facilityToday);
  if (eligible.length === 0) return 0;

  const existing = await client.preventiveMaintenanceOccurrence.findMany({
    where: {
      planId: plan.id,
      scheduledDate: {
        in: eligible.map((row) => civilDateToUtcMidnight(row.scheduledDate)),
      },
    },
    select: { scheduledDate: true },
  });
  const have = new Set(existing.map((row) => parseCivilDate(row.scheduledDate)));

  let created = 0;
  for (const row of eligible) {
    if (have.has(row.scheduledDate)) continue;
    try {
      await client.preventiveMaintenanceOccurrence.create({
        data: {
          planId: plan.id,
          planVersionId: row.planVersionId,
          scheduledDate: civilDateToUtcMidnight(row.scheduledDate),
          status: "OPEN",
        },
      });
      have.add(row.scheduledDate);
      created += 1;
    } catch (err) {
      if (!isUniqueConflict(err)) throw err;
      have.add(row.scheduledDate);
    }
  }
  return created;
}

async function generateWorkOrdersForOpenOccurrences(
  client: DbClient,
  input: { facilityId: string; planId: string; now: Date },
  result: PmGeneratorResult,
) {
  const open = await client.preventiveMaintenanceOccurrence.findMany({
    where: { planId: input.planId, status: "OPEN" },
    include: {
      workOrders: { select: { id: true, status: true } },
    },
  });

  for (const occurrence of open) {
    const active = occurrence.workOrders.find((row) => isPmActiveWorkOrderStatus(row.status));
    if (active) continue;
    try {
      const created = await createPreventiveWorkOrderForOccurrence({
        occurrenceId: occurrence.id,
        client,
        now: input.now,
      });
      if (created.created) result.workOrdersCreated += 1;
    } catch (err) {
      if (err instanceof PmWorkOrderConfigurationError) {
        if (err.code === "OCCURRENCE_NOT_OPEN" || err.code === "GENERATION_INELIGIBLE") {
          result.skippedIneligible += 1;
          continue;
        }
        result.configurationErrors.push({
          facilityId: input.facilityId,
          planId: input.planId,
          occurrenceId: occurrence.id,
          code: err.code,
          message: err.message,
        });
        continue;
      }
      result.configurationErrors.push({
        facilityId: input.facilityId,
        planId: input.planId,
        occurrenceId: occurrence.id,
        code: "WORK_ORDER_FAILED",
        message: err instanceof Error ? err.message : "Work Order generation failed.",
      });
    }
  }
}

export async function generatePmForFacility(
  client: DbClient,
  input: { facilityId: string; now?: Date; timezone?: string | null },
): Promise<PmGeneratorResult> {
  const result = emptyResult();
  const now = input.now ?? new Date();
  const facility =
    input.timezone !== undefined
      ? { id: input.facilityId, timezone: input.timezone }
      : await client.facility.findFirst({
          where: { id: input.facilityId },
          select: { id: true, timezone: true },
        });
  if (!facility) {
    result.configurationErrors.push({
      facilityId: input.facilityId,
      code: "FACILITY_MISSING",
      message: "Facility not found.",
    });
    return result;
  }

  result.facilitiesProcessed = 1;
  const facilityToday = facilityCivilToday(facility.timezone, now);

  const plans = await client.preventiveMaintenancePlan.findMany({
    where: { facilityId: input.facilityId, status: "PUBLISHED" },
    include: {
      asset: { select: { id: true, status: true } },
      versions: {
        where: { status: { in: ["PUBLISHED", "SUPERSEDED"] } },
      },
    },
  });

  for (const plan of plans) {
    result.plansProcessed += 1;
    if (!isPmPlanGenerationEligible({ planStatus: plan.status, assetStatus: plan.asset.status })) {
      result.skippedIneligible += 1;
      continue;
    }

    try {
      result.occurrencesCreated += await materializeMissingOccurrences(
        client,
        plan,
        facilityToday,
      );
      await generateWorkOrdersForOpenOccurrences(
        client,
        { facilityId: input.facilityId, planId: plan.id, now },
        result,
      );
    } catch (err) {
      result.configurationErrors.push({
        facilityId: input.facilityId,
        planId: plan.id,
        code: "PLAN_FAILED",
        message: err instanceof Error ? err.message : "Plan generation failed.",
      });
    }
  }

  return result;
}

export async function runPmGeneration(
  client: DbClient = prisma,
  input: { now?: Date } = {},
): Promise<PmGeneratorResult> {
  const now = input.now ?? new Date();
  const facilities = await client.facility.findMany({
    where: { preventiveMaintenancePlans: { some: { status: "PUBLISHED" } } },
    select: { id: true, timezone: true },
  });

  const combined = emptyResult();
  for (const facility of facilities) {
    try {
      const partial = await generatePmForFacility(client, {
        facilityId: facility.id,
        timezone: facility.timezone,
        now,
      });
      combined.facilitiesProcessed += partial.facilitiesProcessed;
      combined.plansProcessed += partial.plansProcessed;
      combined.occurrencesCreated += partial.occurrencesCreated;
      combined.workOrdersCreated += partial.workOrdersCreated;
      combined.skippedIneligible += partial.skippedIneligible;
      combined.configurationErrors.push(...partial.configurationErrors);
    } catch (err) {
      combined.facilitiesProcessed += 1;
      combined.configurationErrors.push({
        facilityId: facility.id,
        code: "FACILITY_FAILED",
        message: err instanceof Error ? err.message : "Facility generation failed.",
      });
    }
  }
  return combined;
}

/**
 * Public single-day Review loader. One batched facts read, then compose.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  resolveFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";

import { composeOperationalReviewDay } from "./compose-operational-review-day";
import { loadOperationalReviewDayFacts } from "./load-operational-review-day-facts";
import { isReviewServiceDateKey } from "./present-operational-review-day";
import type { OperationalReviewDayFacts, OperationalReviewDayViewModel } from "./types";

type Db = PrismaClient | Prisma.TransactionClient;

export async function loadOperationalReviewDay(input: {
  client: Db;
  facilityId: string;
  serviceDate?: string | null;
  departmentId?: string | null;
  now?: Date;
}): Promise<{
  facts: OperationalReviewDayFacts;
  model: OperationalReviewDayViewModel;
}> {
  let serviceDate = input.serviceDate?.trim() ?? "";
  if (!isReviewServiceDateKey(serviceDate)) {
    const timezone = resolveFacilityTimezone(
      await loadFacilityTimezone(input.client as PrismaClient, input.facilityId),
    );
    serviceDate = toServiceDateKey(getFacilityServiceDate(timezone, input.now ?? new Date()));
  }

  const facts = await loadOperationalReviewDayFacts({
    client: input.client,
    facilityId: input.facilityId,
    serviceDate,
    departmentId: input.departmentId,
    now: input.now,
  });

  return {
    facts,
    model: composeOperationalReviewDay(facts),
  };
}

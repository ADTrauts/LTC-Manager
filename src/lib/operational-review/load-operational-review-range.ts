/**
 * Public range Review loader. Validates, batch-loads facts, composes each day, then aggregates.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  resolveFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";

import { composeOperationalReviewDay } from "./compose-operational-review-day";
import { composeOperationalReviewRange } from "./compose-operational-review-range";
import { loadOperationalReviewRangeFacts } from "./load-operational-review-range-facts";
import { isReviewServiceDateKey } from "./present-operational-review-day";
import { validateReviewRange, type ReviewRangeValidation } from "./service-date-range";
import type { OperationalReviewRangeViewModel } from "./types";

type Db = PrismaClient | Prisma.TransactionClient;

export async function loadOperationalReviewRange(input: {
  client: Db;
  facilityId: string;
  startServiceDate?: string | null;
  endServiceDate?: string | null;
  departmentId?: string | null;
  now?: Date;
}): Promise<
  | { ok: true; model: OperationalReviewRangeViewModel }
  | { ok: false; validation: Extract<ReviewRangeValidation, { ok: false }>; todayKey: string }
> {
  const timezone = resolveFacilityTimezone(
    await loadFacilityTimezone(input.client as PrismaClient, input.facilityId),
  );
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, input.now ?? new Date()));
  const startRaw = input.startServiceDate?.trim() ?? "";
  const endRaw = input.endServiceDate?.trim() ?? "";
  if (
    (startRaw && !isReviewServiceDateKey(startRaw)) ||
    (endRaw && !isReviewServiceDateKey(endRaw))
  ) {
    return {
      ok: false,
      todayKey,
      validation: {
        ok: false,
        code: "invalid_dates",
        message: "Enter a start and end facility service date.",
      },
    };
  }
  const validation = validateReviewRange({
    start: startRaw || todayKey,
    end: endRaw || todayKey,
    todayKey,
  });
  if (!validation.ok) {
    return { ok: false, validation, todayKey };
  }

  const { factsByDate } = await loadOperationalReviewRangeFacts({
    client: input.client,
    facilityId: input.facilityId,
    startServiceDate: validation.start,
    endServiceDate: validation.end,
    keys: validation.keys,
    departmentId: input.departmentId,
    now: input.now,
  });

  const days = validation.keys.map((serviceDate) => {
    const facts = factsByDate.get(serviceDate);
    if (!facts) {
      throw new Error(`Missing Review facts for ${serviceDate}.`);
    }
    return composeOperationalReviewDay(facts);
  });

  return {
    ok: true,
    model: composeOperationalReviewRange({
      days,
      startServiceDate: validation.start,
      endServiceDate: validation.end,
      todayKey,
    }),
  };
}

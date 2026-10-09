import type { Prisma, PrismaClient } from "@prisma/client";

import {
  loadOperationalReviewDay,
  loadOperationalReviewRange,
  presentOperationalReviewDay,
  presentOperationalReviewRange,
  type OperationalReviewDayPresentation,
  type OperationalReviewRangePresentation,
} from "@/lib/operational-review";

type Db = PrismaClient | Prisma.TransactionClient;

function rewriteEvidenceHref<T extends { recordId: string | null; recordHref: string | null }>(row: T): T {
  return {
    ...row,
    recordHref: row.recordId ? `/partner/logs/records/${row.recordId}` : null,
  };
}

/** Partner Review never links into internal Audit, Locations, or Assets. */
export function presentPartnerReviewDay(
  day: OperationalReviewDayPresentation,
): OperationalReviewDayPresentation {
  return {
    ...day,
    locations: day.locations.map((location) => ({ ...location, currentLocationHref: null })),
    evidence: {
      ...day.evidence,
      attention: day.evidence.attention.map(rewriteEvidenceHref),
      completed: day.evidence.completed.map(rewriteEvidenceHref),
    },
    assets: {
      rows: day.assets.rows.map((row) => ({ ...row, href: "" })),
    },
  };
}

export function presentPartnerReviewRange(
  range: OperationalReviewRangePresentation,
): OperationalReviewRangePresentation {
  return {
    ...range,
    days: range.days.map((day) => ({
      ...day,
      href: `/partner/reports?date=${day.serviceDate}`,
    })),
    correctiveDays: range.correctiveDays.map((day) => ({
      ...day,
      href: `/partner/reports?date=${day.serviceDate}`,
    })),
    presentedDays: range.presentedDays.map(presentPartnerReviewDay),
  };
}

export async function loadPartnerOperationalReview(input: {
  client: Db;
  facilityId: string;
  departmentId: string;
  date?: string | null;
  start?: string | null;
  end?: string | null;
  now?: Date;
}): Promise<
  | { mode: "day"; presentation: OperationalReviewDayPresentation; todayKey: string }
  | {
      mode: "range";
      presentation: OperationalReviewRangePresentation | null;
      todayKey: string;
      validationMessage: string | null;
      start: string;
      end: string;
    }
> {
  const departmentId = input.departmentId.trim();
  if (!departmentId) {
    throw new Error("Partner Review requires one Department.");
  }
  const start = input.start?.trim() ?? "";
  const end = input.end?.trim() ?? "";
  if (start && end && start !== end) {
    const loaded = await loadOperationalReviewRange({
      client: input.client,
      facilityId: input.facilityId,
      departmentId,
      startServiceDate: start,
      endServiceDate: end,
      now: input.now,
      omitFacilityWideFacts: true,
    });
    if (!loaded.ok) {
      return {
        mode: "range",
        presentation: null,
        todayKey: loaded.todayKey,
        validationMessage: loaded.validation.message,
        start: start || loaded.todayKey,
        end: end || loaded.todayKey,
      };
    }
    return {
      mode: "range",
      presentation: presentPartnerReviewRange(presentOperationalReviewRange(loaded.model)),
      todayKey: loaded.model.todayKey,
      validationMessage: null,
      start: loaded.model.startServiceDate,
      end: loaded.model.endServiceDate,
    };
  }

  const loaded = await loadOperationalReviewDay({
    client: input.client,
    facilityId: input.facilityId,
    departmentId,
    serviceDate: input.date || start || end || undefined,
    now: input.now,
    omitFacilityWideFacts: true,
  });
  return {
    mode: "day",
    todayKey: loaded.facts.todayKey,
    presentation: presentPartnerReviewDay(
      presentOperationalReviewDay(loaded.model, { todayKey: loaded.facts.todayKey }),
    ),
  };
}

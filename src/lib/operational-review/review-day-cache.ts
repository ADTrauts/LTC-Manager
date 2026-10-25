import type { Prisma, PrismaClient } from "@prisma/client";

import { loadOperationalReviewDay } from "./load-operational-review-day";

type Db = PrismaClient | Prisma.TransactionClient;

export type CachedReviewDayInput = {
  client: Db;
  facilityId: string;
  serviceDate: string;
  departmentId?: string | null;
  now?: Date;
};

type ReviewDay = Awaited<ReturnType<typeof loadOperationalReviewDay>>;

const cache = new Map<string, Promise<ReviewDay>>();

function cacheKey(input: CachedReviewDayInput): string {
  return `${input.facilityId}|${input.departmentId ?? ""}|${input.serviceDate}`;
}

/** One review day per facility, Department, and service date. A failed load is not kept. */
export function cachedOperationalReviewDay(
  input: CachedReviewDayInput,
  load: (input: CachedReviewDayInput) => Promise<ReviewDay> = loadOperationalReviewDay,
): Promise<ReviewDay> {
  const key = cacheKey(input);
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = load(input).catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}

export function clearOperationalReviewDayCache(): void {
  cache.clear();
}

/** Calendar day before a facility service date. */
export function previousServiceDateKey(serviceDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(serviceDate);
  if (!match) return serviceDate;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

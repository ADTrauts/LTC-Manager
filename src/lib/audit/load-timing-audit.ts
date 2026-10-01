/**
 * Operational timing audit for a facility service-date range.
 * Facts are loaded in batches. Each date then uses the Phase D timing model:
 * canonical Key Point actuals, or legacy milestones, never both.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  DIETARY_MEAL_KEYS,
  dietaryTimingForLegacyControl,
  selectDietaryMealTimingModel,
} from "@/lib/dietary/meal-timing";
import { currentKeyPointActual } from "@/lib/operational-cycles/cycle-canonical";
import { isApplicableWeekday } from "@/lib/operational-cycles/cycle-windows";
import { mapCycleRow } from "@/lib/operational-cycles/load-published-cycles";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";
import {
  facilityLocalDateToServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { enumerateServiceDateKeys } from "@/lib/operational-review/service-date-range";

import { resolvePlaceLabel, type PlaceNameChangeFact } from "./place-name";
import { composeOperationalTimingAudit, type TimingAuditDayInput, type TimingAuditRow } from "./timing-audit";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function loadOperationalTimingAudit(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    fromDateKey: string;
    toDateKey: string;
    locationId?: string | null;
  },
): Promise<TimingAuditRow[]> {
  const dates = enumerateServiceDateKeys(input.fromDateKey, input.toDateKey);
  if (dates.length === 0) return [];
  const startDate = facilityLocalDateToServiceDate(input.fromDateKey);
  const endDate = facilityLocalDateToServiceDate(input.toDateKey);

  const [timezone, cycleRows, actuals, expectations, legacyEvents, spaces, units, nameChanges] = await Promise.all([
    loadFacilityTimezone(client as PrismaClient, input.facilityId),
    client.departmentOperationalCycle.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        effectiveFrom: { lte: endDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: startDate } }],
        AND: [
          {
            OR: [{ status: "PUBLISHED" }, { status: "RETIRED", effectiveTo: { not: null } }],
          },
        ],
      },
      include: {
        locations: { select: { unitId: true, spaceId: true } },
        milestoneTimes: { select: { unitId: true, milestone: true, configuredTime: true } },
        keyTimeGroups: {
          select: {
            id: true,
            dueLocal: true,
            displaySequence: true,
            rooms: { select: { spaceId: true } },
          },
          orderBy: { displaySequence: "asc" },
        },
      },
      orderBy: [{ displaySequence: "asc" }, { stableKey: "asc" }, { version: "desc" }],
    }),
    client.operationalCycleKeyPointActual.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate: { gte: startDate, lte: endDate },
      },
      select: {
        serviceDate: true,
        spaceId: true,
        cycleStableKey: true,
        cycleVersion: true,
        actualLocal: true,
        recordedAt: true,
      },
    }),
    client.operationalCycleKeyTimeDayExpectation.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate: { gte: startDate, lte: endDate },
      },
      select: {
        serviceDate: true,
        spaceId: true,
        cycleStableKey: true,
        configuredDueLocal: true,
        adjustedDueLocal: true,
      },
    }),
    client.serveryMealServiceEvent.findMany({
      where: {
        serviceDate: { gte: startDate, lte: endDate },
        unit: { facilityId: input.facilityId },
      },
      select: {
        serviceDate: true,
        unitId: true,
        mealType: true,
        mealServiceReadyAt: true,
        readyRecordedAt: true,
        mealServiceStartedAt: true,
        startedRecordedAt: true,
        entries: {
          select: { milestone: true, occurredAt: true, recordedAt: true },
          orderBy: { recordedAt: "desc" },
        },
      },
    }),
    client.unitSpace.findMany({
      where: { unit: { facilityId: input.facilityId } },
      select: { id: true, name: true },
    }),
    client.unit.findMany({
      where: { facilityId: input.facilityId },
      select: { id: true, name: true },
    }),
    client.placeNameChange.findMany({
      where: { facilityId: input.facilityId },
      select: {
        placeKind: true,
        unitSpaceId: true,
        unitId: true,
        previousLabel: true,
        newLabel: true,
        effectiveFrom: true,
      },
    }),
  ]);

  const cycles = cycleRows.map((row) => mapCycleRow(row));
  const spaceLabels = new Map(spaces.map((space) => [space.id, space.name]));
  const unitLabels = new Map(units.map((unit) => [unit.id, unit.name]));
  const placeHistory: PlaceNameChangeFact[] = nameChanges.flatMap((row) => {
    if (row.placeKind !== "SPACE" && row.placeKind !== "UNIT") return [];
    const placeId = row.placeKind === "SPACE" ? row.unitSpaceId : row.unitId;
    if (!placeId) return [];
    return [
      {
        placeId,
        placeKind: row.placeKind,
        previousLabel: row.previousLabel,
        newLabel: row.newLabel,
        effectiveFromKey: toServiceDateKey(row.effectiveFrom),
      },
    ];
  });
  const days: TimingAuditDayInput[] = [];

  for (const serviceDateKey of dates) {
    const effective = cycles.filter((cycle) => cycleCoversDate(cycle, serviceDateKey, timezone));
    const handled = new Set<string>();
    for (const meal of DIETARY_MEAL_KEYS) {
      const mealType = meal.toUpperCase();
      for (const eventType of ["READY", "STARTED"] as const) {
        const model = selectDietaryMealTimingModel({
          mealType,
          eventType,
          effectiveCycles: effective,
        });
        if (model === "NOT_CONFIGURED") continue;
        const mapped = dietaryTimingForLegacyControl({ mealType, eventType });
        if (!mapped) continue;
        handled.add(mapped.stableKey);
        if (model === "CANONICAL_KEY_POINTS") {
          const cycle = effective.find(
            (row) => row.stableKey === mapped.stableKey && row.nodeKind === "KEY_TIME",
          );
          days.push(
            ...canonicalInputs({
              serviceDateKey,
              cycle,
              stableKey: mapped.stableKey,
              label: cycle?.label ?? "Service Started",
              actuals,
              expectations,
              spaceLabels,
              placeHistory,
            }),
          );
          continue;
        }
        days.push(
          ...legacyInputs({
            serviceDateKey,
            timezone,
            mealType,
            eventType,
            stableKey: mapped.stableKey,
            cycles: effective,
            legacyEvents,
            unitLabels,
            placeHistory,
          }),
        );
      }
    }
    for (const cycle of effective) {
      if (cycle.nodeKind !== "KEY_TIME" || handled.has(cycle.stableKey)) continue;
      days.push(
        ...canonicalInputs({
          serviceDateKey,
          cycle,
          stableKey: cycle.stableKey,
          label: cycle.label,
          actuals,
          expectations,
          spaceLabels,
          placeHistory,
        }),
      );
    }
  }

  const locationId = input.locationId?.trim() || null;
  const scoped = locationId ? days.filter((day) => day.locationId === locationId || day.locationId === null) : days;
  return composeOperationalTimingAudit(scoped);
}

function cycleCoversDate(
  cycle: OperationalCycleDefinition,
  serviceDateKey: string,
  timezone: string,
): boolean {
  const fromKey = toServiceDateKey(cycle.effectiveFrom);
  const toKey = cycle.effectiveTo ? toServiceDateKey(cycle.effectiveTo) : null;
  if (fromKey > serviceDateKey) return false;
  if (toKey && toKey < serviceDateKey) return false;
  if (cycle.status !== "PUBLISHED" && cycle.status !== "RETIRED") return false;
  if (cycle.status === "RETIRED" && !cycle.effectiveTo) return false;
  return isApplicableWeekday(cycle.applicableDaysOfWeek, serviceDateKey, timezone);
}

function canonicalInputs(input: {
  serviceDateKey: string;
  cycle: OperationalCycleDefinition | undefined;
  stableKey: string;
  label: string;
  actuals: Array<{
    serviceDate: Date;
    spaceId: string | null;
    cycleStableKey: string;
    cycleVersion: number;
    actualLocal: string;
    recordedAt: Date;
  }>;
  expectations: Array<{
    serviceDate: Date;
    spaceId: string;
    cycleStableKey: string;
    configuredDueLocal: string;
    adjustedDueLocal: string | null;
  }>;
  spaceLabels: Map<string, string>;
  placeHistory: readonly PlaceNameChangeFact[];
}): TimingAuditDayInput[] {
  const spaces = new Set<string>();
  for (const group of input.cycle?.keyTimeGroups ?? []) {
    for (const spaceId of group.spaceIds) spaces.add(spaceId);
  }
  const targets = spaces.size > 0 ? [...spaces] : [null];
  return targets.map((spaceId) => {
    const expectation = input.expectations.find(
      (row) =>
        toServiceDateKey(row.serviceDate) === input.serviceDateKey &&
        row.cycleStableKey === input.stableKey &&
        row.spaceId === spaceId,
    );
    const planned =
      input.cycle?.keyTimeGroups.find((group) => (spaceId ? group.spaceIds.includes(spaceId) : true))
        ?.dueLocal ??
      expectation?.configuredDueLocal ??
      null;
    const actual = currentKeyPointActual(
      input.actuals.filter(
        (row) =>
          toServiceDateKey(row.serviceDate) === input.serviceDateKey &&
          row.cycleStableKey === input.stableKey &&
          row.spaceId === spaceId,
      ),
    );
    return {
      serviceDateKey: input.serviceDateKey,
      model: "CANONICAL_KEY_POINTS" as const,
      keyPointStableKey: input.stableKey,
      keyPointLabel: input.label,
      cycleVersion: actual?.cycleVersion ?? input.cycle?.version ?? null,
      plannedLocal: planned,
      adjustedLocal: expectation?.adjustedDueLocal ?? null,
      locationId: spaceId,
      locationLabel: spaceId
        ? resolvePlaceLabel({
            serviceDateKey: input.serviceDateKey,
            currentLabel: input.spaceLabels.get(spaceId) ?? "",
            history: input.placeHistory.filter((row) => row.placeKind === "SPACE" && row.placeId === spaceId),
          }).label || null
        : null,
      canonicalActual: actual
        ? {
            actualLocal: actual.actualLocal,
            recordedAt: actual.recordedAt.toISOString(),
            cycleVersion: actual.cycleVersion,
          }
        : null,
      legacyActual: null,
    };
  });
}

function legacyInputs(input: {
  serviceDateKey: string;
  timezone: string;
  mealType: string;
  eventType: "READY" | "STARTED";
  stableKey: string;
  cycles: readonly OperationalCycleDefinition[];
  legacyEvents: Array<{
    serviceDate: Date;
    unitId: string;
    mealType: string;
    mealServiceReadyAt: Date | null;
    readyRecordedAt: Date | null;
    mealServiceStartedAt: Date | null;
    startedRecordedAt: Date | null;
    entries: Array<{ milestone: string; occurredAt: Date; recordedAt: Date | null }>;
  }>;
  unitLabels: Map<string, string>;
  placeHistory: readonly PlaceNameChangeFact[];
}): TimingAuditDayInput[] {
  const milestone = input.eventType === "READY" ? "READY" : "SERVICE_STARTED";
  const period = input.cycles.find(
    (cycle) =>
      cycle.nodeKind === "PERIOD" &&
      (cycle.stableKey === input.mealType.toLowerCase() || cycle.mealType === input.mealType),
  );
  const times = (period?.milestoneTimes ?? []).filter((row) => row.milestone === milestone);
  const units = times.length > 0 ? [...new Set(times.map((row) => row.unitId))] : [null];
  return units.map((unitId) => {
    const planned = times.find((row) => row.unitId === unitId)?.configuredTime ?? period?.startLocal ?? null;
    const event = input.legacyEvents.find(
      (row) =>
        toServiceDateKey(row.serviceDate) === input.serviceDateKey &&
        row.mealType === input.mealType &&
        (unitId ? row.unitId === unitId : true),
    );
    const entry =
      event?.entries.find((row) => row.milestone === milestone) ??
      (milestone === "READY" && event?.mealServiceReadyAt
        ? { occurredAt: event.mealServiceReadyAt, recordedAt: event.readyRecordedAt }
        : milestone === "SERVICE_STARTED" && event?.mealServiceStartedAt
          ? { occurredAt: event.mealServiceStartedAt, recordedAt: event.startedRecordedAt }
          : null);
    return {
      serviceDateKey: input.serviceDateKey,
      model: "LEGACY_MILESTONES" as const,
      keyPointStableKey: input.stableKey,
      keyPointLabel: milestone === "SERVICE_STARTED" ? "Service Started" : "Ready",
      cycleVersion: period?.version ?? null,
      plannedLocal: planned,
      adjustedLocal: null,
      locationId: unitId,
      locationLabel: unitId
        ? resolvePlaceLabel({
            serviceDateKey: input.serviceDateKey,
            currentLabel: input.unitLabels.get(unitId) ?? "",
            history: input.placeHistory.filter((row) => row.placeKind === "UNIT" && row.placeId === unitId),
          }).label || null
        : null,
      canonicalActual: null,
      legacyActual: entry
        ? {
            occurredAt: localHm(entry.occurredAt, input.timezone),
            recordedAt: entry.recordedAt?.toISOString() ?? null,
          }
        : null,
    };
  });
}

function localHm(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

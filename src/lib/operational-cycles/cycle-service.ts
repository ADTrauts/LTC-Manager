import type { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import {
  requireCycleManage,
  requireCyclePublish,
  resolveCycleAuthority,
} from "./cycle-authority";
import { buildDietaryDefaultCyclePlans, buildEvsDefaultCyclePlans } from "./defaults";
import type { PublishedCycleOverlapCandidate } from "./validate-cycle";
import { validateCycle, validateCycleForPublish } from "./validate-cycle";
import type { CycleDraftInput } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

export type CycleActor = {
  userId: string | null;
  label?: string | null;
};

async function appendCycleEvent(
  client: DbClient,
  input: {
    cycleId: string;
    facilityId: string;
    departmentId: string;
    eventType: string;
    actor: CycleActor;
    detailJson?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await client.departmentOperationalCycleEvent.create({
    data: {
      id: cuidLike(),
      cycleId: input.cycleId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      eventType: input.eventType,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label ?? null,
      detailJson: input.detailJson ?? undefined,
    },
  });
}

async function assertManage(
  session: AppJwtPayload,
  facilityId: string,
  departmentId: string,
) {
  const authority = await resolveCycleAuthority(session, facilityId, departmentId);
  requireCycleManage(authority);
  return authority;
}

function dayBefore(dateKey: string): string {
  const d = facilityLocalDateToServiceDate(dateKey);
  d.setUTCDate(d.getUTCDate() - 1);
  return toServiceDateKey(d);
}

async function nextVersionForStableKey(
  client: DbClient,
  departmentId: string,
  stableKey: string,
): Promise<number> {
  const latest = await client.departmentOperationalCycle.findFirst({
    where: { departmentId, stableKey },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

async function loadPublishedOverlapPeers(
  client: DbClient,
  facilityId: string,
  departmentId: string,
  excludeCycleId?: string,
): Promise<PublishedCycleOverlapCandidate[]> {
  const rows = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId,
      departmentId,
      status: "PUBLISHED",
      ...(excludeCycleId ? { id: { not: excludeCycleId } } : {}),
    },
    include: { locations: { select: { unitId: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    startLocal: r.startLocal,
    endLocal: r.endLocal,
    overnight: r.overnight,
    applicableDaysOfWeek: r.applicableDaysOfWeek,
    locationMode: r.locationMode,
    applicableUnitTypes: r.applicableUnitTypes,
    unitIds: r.locations.map((l) => l.unitId),
  }));
}

export async function createDraft(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    draft: CycleDraftInput;
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const locationMode = input.draft.locationMode ?? "ALL_DEPARTMENT_UNITS";
  const validation = validateCycle({
    label: input.draft.label,
    cycleType: input.draft.cycleType,
    startLocal: input.draft.startLocal,
    endLocal: input.draft.endLocal,
    overnight: input.draft.overnight,
    applicableDaysOfWeek: input.draft.applicableDaysOfWeek,
    effectiveFrom: input.draft.effectiveFrom,
    mealType: input.draft.mealType,
    locationMode,
    applicableUnitTypes: input.draft.applicableUnitTypes,
    unitIds: input.draft.unitIds,
    expectedMilestones: input.draft.expectedMilestones,
  });
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join(" "));
  }

  const stableKey = input.draft.stableKey?.trim() || `cycle_${cuidLike()}`;
  const version = await nextVersionForStableKey(client, input.departmentId, stableKey);
  const unitIds = locationMode === "EXPLICIT_UNITS" ? (input.draft.unitIds ?? []) : [];

  const created = await client.departmentOperationalCycle.create({
    data: {
      id: cuidLike(),
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      stableKey,
      version,
      label: input.draft.label.trim(),
      description: input.draft.description?.trim() || null,
      cycleType: input.draft.cycleType,
      displaySequence: input.draft.displaySequence ?? 100,
      startLocal: input.draft.startLocal.trim(),
      endLocal: input.draft.endLocal.trim(),
      overnight: input.draft.overnight ?? false,
      applicableDaysOfWeek: input.draft.applicableDaysOfWeek,
      effectiveFrom: facilityLocalDateToServiceDate(input.draft.effectiveFrom),
      effectiveTo: input.draft.effectiveTo
        ? facilityLocalDateToServiceDate(input.draft.effectiveTo)
        : null,
      mealType: input.draft.mealType ?? null,
      locationMode,
      applicableUnitTypes:
        locationMode === "UNIT_TYPES" ? (input.draft.applicableUnitTypes ?? []) : [],
      expectedMilestones:
        input.draft.cycleType === "SERVICE" ? (input.draft.expectedMilestones ?? []) : [],
      status: "DRAFT",
      createdByUserId: input.actor.userId,
      lastChangedByUserId: input.actor.userId,
      locations: unitIds.length
        ? { create: unitIds.map((unitId) => ({ id: cuidLike(), unitId })) }
        : undefined,
    },
  });

  await appendCycleEvent(client, {
    cycleId: created.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "CREATED_DRAFT",
    actor: input.actor,
    detailJson: { stableKey, version },
  });

  return created;
}

export async function updateDraft(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    cycleId: string;
    draft: CycleDraftInput;
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const existing = await client.departmentOperationalCycle.findFirst({
    where: {
      id: input.cycleId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
  });
  if (!existing) throw new Error("Cycle not found.");
  if (existing.status !== "DRAFT") {
    throw new Error("Only draft cycles can be updated. Duplicate to create a new draft version.");
  }

  const locationMode = input.draft.locationMode ?? existing.locationMode;
  const validation = validateCycle({
    label: input.draft.label,
    cycleType: input.draft.cycleType,
    startLocal: input.draft.startLocal,
    endLocal: input.draft.endLocal,
    overnight: input.draft.overnight,
    applicableDaysOfWeek: input.draft.applicableDaysOfWeek,
    effectiveFrom: input.draft.effectiveFrom,
    mealType: input.draft.mealType,
    locationMode,
    applicableUnitTypes: input.draft.applicableUnitTypes,
    unitIds: input.draft.unitIds,
    expectedMilestones: input.draft.expectedMilestones,
  });
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join(" "));
  }

  const unitIds = locationMode === "EXPLICIT_UNITS" ? (input.draft.unitIds ?? []) : [];

  await client.departmentOperationalCycleLocation.deleteMany({ where: { cycleId: existing.id } });

  const updated = await client.departmentOperationalCycle.update({
    where: { id: existing.id },
    data: {
      label: input.draft.label.trim(),
      description: input.draft.description?.trim() || null,
      cycleType: input.draft.cycleType,
      displaySequence: input.draft.displaySequence ?? existing.displaySequence,
      startLocal: input.draft.startLocal.trim(),
      endLocal: input.draft.endLocal.trim(),
      overnight: input.draft.overnight ?? false,
      applicableDaysOfWeek: input.draft.applicableDaysOfWeek,
      effectiveFrom: facilityLocalDateToServiceDate(input.draft.effectiveFrom),
      effectiveTo: input.draft.effectiveTo
        ? facilityLocalDateToServiceDate(input.draft.effectiveTo)
        : null,
      mealType: input.draft.mealType ?? null,
      locationMode,
      applicableUnitTypes:
        locationMode === "UNIT_TYPES" ? (input.draft.applicableUnitTypes ?? []) : [],
      expectedMilestones:
        input.draft.cycleType === "SERVICE" ? (input.draft.expectedMilestones ?? []) : [],
      lastChangedByUserId: input.actor.userId,
      locations: unitIds.length
        ? { create: unitIds.map((unitId) => ({ id: cuidLike(), unitId })) }
        : undefined,
    },
  });

  await appendCycleEvent(client, {
    cycleId: updated.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "UPDATED_DRAFT",
    actor: input.actor,
  });

  return updated;
}

/**
 * Duplicate a cycle (published or draft) into a new draft version of the same stableKey.
 * Published windows are immutable — change via duplicate + publish.
 */
export async function duplicateCycle(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    cycleId: string;
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const source = await client.departmentOperationalCycle.findFirst({
    where: {
      id: input.cycleId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: { locations: true },
  });
  if (!source) throw new Error("Cycle not found.");

  const version = await nextVersionForStableKey(client, input.departmentId, source.stableKey);

  const created = await client.departmentOperationalCycle.create({
    data: {
      id: cuidLike(),
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      stableKey: source.stableKey,
      version,
      label: source.label,
      description: source.description,
      cycleType: source.cycleType,
      displaySequence: source.displaySequence,
      startLocal: source.startLocal,
      endLocal: source.endLocal,
      overnight: source.overnight,
      applicableDaysOfWeek: source.applicableDaysOfWeek,
      effectiveFrom: source.effectiveFrom,
      effectiveTo: source.effectiveTo,
      mealType: source.mealType,
      locationMode: source.locationMode,
      applicableUnitTypes: source.applicableUnitTypes,
      expectedMilestones: source.expectedMilestones,
      status: "DRAFT",
      createdByUserId: input.actor.userId,
      lastChangedByUserId: input.actor.userId,
      locations:
        source.locations.length > 0
          ? {
              create: source.locations.map((l) => ({
                id: cuidLike(),
                unitId: l.unitId,
              })),
            }
          : undefined,
    },
  });

  await appendCycleEvent(client, {
    cycleId: created.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "DUPLICATED_DRAFT",
    actor: input.actor,
    detailJson: { sourceCycleId: source.id, version },
  });

  return created;
}

export async function reorderDrafts(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    orderedCycleIds: string[];
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const drafts = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: "DRAFT",
      id: { in: input.orderedCycleIds },
    },
    select: { id: true },
  });
  const found = new Set(drafts.map((d) => d.id));
  for (const id of input.orderedCycleIds) {
    if (!found.has(id)) {
      throw new Error("Reorder only applies to draft cycles in this department.");
    }
  }

  let sequence = 10;
  for (const id of input.orderedCycleIds) {
    await client.departmentOperationalCycle.update({
      where: { id },
      data: {
        displaySequence: sequence,
        lastChangedByUserId: input.actor.userId,
      },
    });
    sequence += 10;
  }

  if (input.orderedCycleIds[0]) {
    await appendCycleEvent(client, {
      cycleId: input.orderedCycleIds[0],
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      eventType: "REORDERED_DRAFTS",
      actor: input.actor,
      detailJson: { orderedCycleIds: input.orderedCycleIds },
    });
  }
}

export async function publishCycle(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    cycleId: string;
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveCycleAuthority(session, input.facilityId, input.departmentId);
  requireCyclePublish(authority);

  const existing = await client.departmentOperationalCycle.findFirst({
    where: {
      id: input.cycleId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: { locations: true },
  });
  if (!existing) throw new Error("Cycle not found.");
  if (existing.status !== "DRAFT") {
    throw new Error("Only draft cycles can be published.");
  }

  const timezone = await loadFacilityTimezone(client as PrismaClient, input.facilityId);
  const peers = await loadPublishedOverlapPeers(
    client,
    input.facilityId,
    input.departmentId,
    existing.id,
  );

  const validation = validateCycleForPublish(
    {
      label: existing.label,
      cycleType: existing.cycleType,
      startLocal: existing.startLocal,
      endLocal: existing.endLocal,
      overnight: existing.overnight,
      applicableDaysOfWeek: existing.applicableDaysOfWeek,
      effectiveFrom: toServiceDateKey(existing.effectiveFrom),
      mealType: existing.mealType,
      locationMode: existing.locationMode,
      applicableUnitTypes: existing.applicableUnitTypes,
      unitIds: existing.locations.map((l) => l.unitId),
      expectedMilestones: existing.expectedMilestones,
    },
    peers,
    timezone,
  );
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join(" "));
  }

  // Retire prior published versions of the same stableKey prospectively.
  const priorPublished = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      stableKey: existing.stableKey,
      status: "PUBLISHED",
      id: { not: existing.id },
    },
  });

  const effectiveFromKey = toServiceDateKey(existing.effectiveFrom);
  for (const prior of priorPublished) {
    const retireTo = dayBefore(effectiveFromKey);
    await client.departmentOperationalCycle.update({
      where: { id: prior.id },
      data: {
        status: "RETIRED",
        effectiveTo: facilityLocalDateToServiceDate(retireTo),
        retiredAt: new Date(),
        lastChangedByUserId: input.actor.userId,
      },
    });
    await appendCycleEvent(client, {
      cycleId: prior.id,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      eventType: "RETIRED_ON_SUPERSEDE",
      actor: input.actor,
      detailJson: { supersededBy: existing.id, effectiveTo: retireTo },
    });
  }

  const published = await client.departmentOperationalCycle.update({
    where: { id: existing.id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedByUserId: input.actor.userId,
      lastChangedByUserId: input.actor.userId,
    },
  });

  await appendCycleEvent(client, {
    cycleId: published.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "PUBLISHED",
    actor: input.actor,
  });

  return published;
}

/**
 * Retire a published cycle. Sets effectiveTo to the day before today (facility-local)
 * so historical dates retain the prior effective cycle.
 */
export async function retireCycle(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    cycleId: string;
    actor: CycleActor;
    /** Facility-local today YYYY-MM-DD; defaults to UTC date if omitted. */
    todayKey?: string;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const existing = await client.departmentOperationalCycle.findFirst({
    where: {
      id: input.cycleId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
  });
  if (!existing) throw new Error("Cycle not found.");
  if (existing.status !== "PUBLISHED") {
    throw new Error("Only published cycles can be retired.");
  }

  const timezone = await loadFacilityTimezone(client as PrismaClient, input.facilityId);
  const todayKey =
    input.todayKey ?? toServiceDateKey(getFacilityServiceDate(timezone, new Date()));
  const effectiveToKey = dayBefore(todayKey);

  const retired = await client.departmentOperationalCycle.update({
    where: { id: existing.id },
    data: {
      status: "RETIRED",
      effectiveTo: facilityLocalDateToServiceDate(effectiveToKey),
      retiredAt: new Date(),
      lastChangedByUserId: input.actor.userId,
    },
  });

  await appendCycleEvent(client, {
    cycleId: retired.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "RETIRED",
    actor: input.actor,
    detailJson: { effectiveTo: effectiveToKey },
  });

  return retired;
}

/**
 * Create draft defaults from the Dietary example plan for review.
 * Only when explicitly requested — never auto-applied.
 */
export async function generateDietaryDefaultsDrafts(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    effectiveFrom: string;
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const plans = buildDietaryDefaultCyclePlans();
  const created = [];
  for (const plan of plans) {
    const row = await createDraft(session, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      actor: input.actor,
      client,
      draft: {
        stableKey: plan.stableKey,
        label: plan.label,
        description: plan.description,
        cycleType: plan.cycleType,
        displaySequence: plan.displaySequence,
        startLocal: plan.startLocal,
        endLocal: plan.endLocal,
        overnight: plan.overnight,
        applicableDaysOfWeek: plan.applicableDaysOfWeek,
        effectiveFrom: input.effectiveFrom,
        mealType: plan.mealType,
        locationMode: plan.locationMode,
        applicableUnitTypes: plan.applicableUnitTypes,
        expectedMilestones: plan.expectedMilestones,
      },
    });
    created.push(row);
  }
  return created;
}

/**
 * Create draft defaults from the EVS example plan for review.
 * No mealType / SERVICE meal milestones — never auto-applied.
 */
export async function generateEvsDefaultsDrafts(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    effectiveFrom: string;
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const plans = buildEvsDefaultCyclePlans();
  const created = [];
  for (const plan of plans) {
    const row = await createDraft(session, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      actor: input.actor,
      client,
      draft: {
        stableKey: plan.stableKey,
        label: plan.label,
        description: plan.description,
        cycleType: plan.cycleType,
        displaySequence: plan.displaySequence,
        startLocal: plan.startLocal,
        endLocal: plan.endLocal,
        overnight: plan.overnight,
        applicableDaysOfWeek: plan.applicableDaysOfWeek,
        effectiveFrom: input.effectiveFrom,
        mealType: null,
        locationMode: plan.locationMode,
        applicableUnitTypes: plan.applicableUnitTypes,
        expectedMilestones: [],
      },
    });
    created.push(row);
  }
  return created;
}

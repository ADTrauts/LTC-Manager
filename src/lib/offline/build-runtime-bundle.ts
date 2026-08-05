import { createHash } from "node:crypto";

import type { MealType, PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  evaluateServeryMilestoneAccess,
  recordableMealForContext,
  resolveServeryMealServiceContext,
} from "@/lib/servery";

import { actorRefForSession, resolveMilestoneActor } from "./resolve-milestone-actor";
import {
  OFFLINE_BUNDLE_LEASE_HOURS,
  type OfflineMilestoneProjection,
  type OfflineRuntimeBundle,
} from "./types";

function milestoneProjection(input: {
  eventId: string | null;
  occurredAt: Date | null;
  recordedAt: Date | null;
  recordedByLabel: string | null;
  corrected: boolean;
}): OfflineMilestoneProjection {
  return {
    eventId: input.eventId,
    occurredAt: input.occurredAt?.toISOString() ?? null,
    recordedAt: input.recordedAt?.toISOString() ?? null,
    recordedByLabel: input.recordedByLabel,
    corrected: input.corrected,
  };
}

function computeServerRevision(input: {
  unitUpdatedAt: Date;
  mealTimesUpdatedAt: Date;
  events: { id: string; updatedAt: Date; mealServiceReadyAt: Date | null; mealServiceStartedAt: Date | null }[];
}): string {
  const payload = JSON.stringify({
    unit: input.unitUpdatedAt.toISOString(),
    meals: input.mealTimesUpdatedAt.toISOString(),
    events: input.events.map((e) => ({
      id: e.id,
      u: e.updatedAt.toISOString(),
      r: e.mealServiceReadyAt?.toISOString() ?? null,
      s: e.mealServiceStartedAt?.toISOString() ?? null,
    })),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

export type BuildRuntimeBundleInput = {
  session: AppJwtPayload;
  unitId: string;
  deviceFacilityId: string;
  deviceBoundUnitId: string | null;
  now?: Date;
};

export type BuildRuntimeBundleResult =
  | { ok: true; bundle: OfflineRuntimeBundle; issuanceId: string }
  | { ok: false; reason: string; status: 403 | 404 };

/**
 * Build a scoped Unit Workspace offline bundle for one servery unit.
 *
 * Facility Administrators without Dietary operational authority are denied — administrative role
 * alone does not grant a frontline offline bundle.
 */
export async function buildRuntimeBundle(
  input: BuildRuntimeBundleInput,
  client: PrismaClient = defaultPrisma,
): Promise<BuildRuntimeBundleResult> {
  const now = input.now ?? new Date();
  const actor = await resolveMilestoneActor(input.session);
  const access = await evaluateServeryMilestoneAccess(
    {
      facilityId: input.session.facilityId,
      unitId: input.unitId,
      action: "RECORD",
      actor,
      deviceBoundUnitId: input.deviceBoundUnitId,
    },
    client,
  );
  if (!access.ok) {
    return { ok: false, reason: access.reason, status: 403 };
  }

  if (input.deviceFacilityId !== input.session.facilityId) {
    return { ok: false, reason: "DEVICE_FACILITY_MISMATCH", status: 403 };
  }
  if (input.deviceBoundUnitId && input.deviceBoundUnitId !== input.unitId) {
    return { ok: false, reason: "DEVICE_UNIT_CONFLICT", status: 403 };
  }

  const unit = await client.unit.findFirst({
    where: { id: input.unitId, facilityId: input.session.facilityId, isActive: true, unitType: "SERVERY" },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      facility: { select: { id: true, displayName: true, timezone: true } },
      mealTimes: {
        where: { isActive: true },
        select: { mealType: true, scheduledTime: true, updatedAt: true },
        orderBy: { mealType: "asc" },
      },
    },
  });
  if (!unit) {
    return { ok: false, reason: "UNIT_NOT_FOUND", status: 404 };
  }

  const dietary = await client.department.findFirst({
    where: { facilityId: input.session.facilityId, key: "DIETARY", isActive: true },
    select: { id: true, name: true },
  });
  if (!dietary) {
    return { ok: false, reason: "DEPARTMENT_UNAVAILABLE", status: 403 };
  }

  const facilityTimezone = await loadFacilityTimezone(client, input.session.facilityId);
  const serviceDate = getFacilityServiceDate(facilityTimezone, now);
  const serviceDateKey = toServiceDateKey(serviceDate);

  const events = await client.serveryMealServiceEvent.findMany({
    where: { unitId: unit.id, serviceDate },
    select: {
      id: true,
      mealType: true,
      updatedAt: true,
      mealServiceReadyAt: true,
      mealServiceStartedAt: true,
      readyRecordedAt: true,
      startedRecordedAt: true,
      readyRecordedBy: { select: { displayName: true } },
      startedRecordedBy: { select: { displayName: true } },
      readyRecordedByEmployee: { select: { firstName: true, lastName: true } },
      startedRecordedByEmployee: { select: { firstName: true, lastName: true } },
      entries: { select: { milestone: true, kind: true } },
    },
  });

  const mealContext = resolveServeryMealServiceContext({
    unitType: "SERVERY",
    mealTimes: unit.mealTimes.map((m) => ({ mealType: m.mealType, scheduledTime: m.scheduledTime })),
    now,
    facilityTimezone,
  });
  const recordable = recordableMealForContext(mealContext);

  const employeeLabel = (e?: { firstName: string; lastName: string } | null) =>
    e ? `${e.firstName} ${e.lastName}`.trim() : null;

  const milestones = unit.mealTimes.map((slot) => {
    const ev = events.find((e) => e.mealType === slot.mealType);
    const corrected = new Set(ev?.entries?.filter((x) => x.kind === "CORRECTION").map((x) => x.milestone) ?? []);
    return {
      mealType: slot.mealType as MealType,
      ready: milestoneProjection({
        eventId: ev?.id ?? null,
        occurredAt: ev?.mealServiceReadyAt ?? null,
        recordedAt: ev?.readyRecordedAt ?? null,
        recordedByLabel: ev?.readyRecordedBy?.displayName ?? employeeLabel(ev?.readyRecordedByEmployee) ?? null,
        corrected: corrected.has("READY"),
      }),
      started: milestoneProjection({
        eventId: ev?.id ?? null,
        occurredAt: ev?.mealServiceStartedAt ?? null,
        recordedAt: ev?.startedRecordedAt ?? null,
        recordedByLabel:
          ev?.startedRecordedBy?.displayName ?? employeeLabel(ev?.startedRecordedByEmployee) ?? null,
        corrected: corrected.has("SERVICE_STARTED"),
      }),
    };
  });

  const mealTimesUpdatedAt = unit.mealTimes.reduce(
    (max, m) => (m.updatedAt > max ? m.updatedAt : max),
    unit.mealTimes[0]?.updatedAt ?? unit.updatedAt,
  );

  const serverRevision = computeServerRevision({
    unitUpdatedAt: unit.updatedAt,
    mealTimesUpdatedAt,
    events: events.map((e) => ({
      id: e.id,
      updatedAt: e.updatedAt,
      mealServiceReadyAt: e.mealServiceReadyAt,
      mealServiceStartedAt: e.mealServiceStartedAt,
    })),
  });

  const issuedAt = now;
  const offlineAuthorizedUntil = new Date(
    issuedAt.getTime() + OFFLINE_BUNDLE_LEASE_HOURS * 60 * 60 * 1000,
  );
  const bundleVersion = `${serviceDateKey}:${serverRevision}`;

  const bundle: OfflineRuntimeBundle = {
    bundleVersion,
    serverRevision,
    issuedAt: issuedAt.toISOString(),
    offlineAuthorizedUntil: offlineAuthorizedUntil.toISOString(),
    lastSuccessfulSyncAt: issuedAt.toISOString(),
    facilityId: unit.facility.id,
    facilityTimezone,
    facilityName: unit.facility.displayName,
    departmentId: dietary.id,
    departmentName: dietary.name,
    unitId: unit.id,
    unitName: unit.name,
    deviceFacilityId: input.deviceFacilityId,
    deviceBoundUnitId: input.deviceBoundUnitId,
    actor: {
      displayName: input.session.name,
      role: input.session.role,
      authMethod: input.session.authMethod === "QUICK_PIN" ? "QUICK_PIN" : "PASSWORD",
      authKind: input.session.authKind ?? "user",
      actorRef: actorRefForSession(input.session),
      sessionVersion: input.session.sessionVersion ?? 0,
    },
    operationalDate: serviceDateKey,
    mealContext: {
      applicableMealType: recordable?.mealType ?? null,
      label: recordable ? `${recordable.mealType} · ${recordable.scheduledTime}` : null,
      expectedServiceTime: recordable?.scheduledTime ?? null,
    },
    milestones,
    procedureLabels: [],
  };

  const issuance = await client.offlineBundleIssuance.create({
    data: {
      facilityId: input.session.facilityId,
      unitId: unit.id,
      actorUserId: actor.userId,
      actorEmployeeId: actor.employeeId,
      actorRole: input.session.role,
      authMethod: actor.authMethod,
      deviceFacilityId: input.deviceFacilityId,
      deviceBoundUnitId: input.deviceBoundUnitId,
      sessionVersion: input.session.sessionVersion ?? 0,
      bundleVersion,
      serverRevision,
      offlineAuthorizedUntil,
    },
    select: { id: true },
  });

  return { ok: true, bundle, issuanceId: issuance.id };
}

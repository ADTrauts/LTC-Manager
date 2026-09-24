import { cookies } from "next/headers";

import { OfflineConflictReview } from "@/components/offline/offline-conflict-review";
import { OfflineServeryControls } from "@/components/offline/offline-servery-controls";
import { sessionUserIdForFk, type AppJwtPayload } from "@/lib/auth";
import { DEVICE_FACILITY_COOKIE, DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import { actorRefForSession } from "@/lib/offline/resolve-milestone-actor";
import { getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import {
  describeMealServiceContext,
  evaluateServeryMilestoneAccess,
  recordableMealForContext,
  resolveServeryMealServiceContext,
  roleMayCorrectMilestones,
} from "@/lib/servery";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

export async function renderServeryActionChrome(input: {
  session: AppJwtPayload;
  unitId: string;
  timezone: string;
  now: Date;
}) {
  const serviceDate = getFacilityServiceDate(input.timezone, input.now);
  const dateKey = toServiceDateKey(serviceDate);
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const [unit, events, conflicts] = await Promise.all([
    prisma.unit.findFirst({
      where: { id: input.unitId, facilityId: input.session.facilityId },
      select: {
        unitType: true,
        mealTimes: {
          where: { isActive: true },
          orderBy: { mealType: "asc" },
          select: { mealType: true, scheduledTime: true },
        },
      },
    }),
    prisma.serveryMealServiceEvent.findMany({
      where: {
        unitId: input.unitId,
        serviceDate: { gte: start, lt: end },
      },
      select: {
        mealType: true,
        mealServiceReadyAt: true,
        mealServiceStartedAt: true,
        readyRecordedAt: true,
        startedRecordedAt: true,
        readyRecordedBy: { select: { displayName: true } },
        startedRecordedBy: { select: { displayName: true } },
        readyRecordedByEmployee: { select: { firstName: true, lastName: true } },
        startedRecordedByEmployee: { select: { firstName: true, lastName: true } },
        entries: { where: { kind: "CORRECTION" }, select: { milestone: true } },
      },
    }),
    prisma.offlineConflict.findMany({
      where: {
        facilityId: input.session.facilityId,
        unitId: input.unitId,
        resolution: "PENDING",
      },
      select: {
        clientCommandId: true,
        conflictCategory: true,
        commandPayload: true,
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
  ]);
  if (!unit) return null;

  const sessionEmployeeId = await getOperationalEmployeeIdForSession(input.session);
  const cookieJar = await cookies();
  const deviceBoundUnitId = cookieJar.get(DEVICE_UNIT_COOKIE)?.value?.trim() || null;
  const mealServiceContext = resolveServeryMealServiceContext({
    unitType: unit.unitType,
    mealTimes: unit.mealTimes,
    now: input.now,
    facilityTimezone: input.timezone,
  });
  const milestoneAccess = await evaluateServeryMilestoneAccess({
    facilityId: input.session.facilityId,
    unitId: input.unitId,
    action: "RECORD",
    actor: {
      userId: sessionUserIdForFk(input.session),
      employeeId: sessionEmployeeId,
      role: input.session.role,
      authMethod: input.session.authMethod === "QUICK_PIN" ? "QUICK_PIN" : "PASSWORD",
    },
    deviceBoundUnitId,
  });
  const canRecord = milestoneAccess.ok === true;
  const canCorrect = canRecord && roleMayCorrectMilestones(input.session.role);

  const eventByMeal = Object.fromEntries(
    unit.mealTimes.map((slot) => {
      const ev = events.find((row) => row.mealType === slot.mealType);
      const corrected = new Set(ev?.entries?.map((entry) => entry.milestone) ?? []);
      const readyName = ev?.readyRecordedByEmployee
        ? `${ev.readyRecordedByEmployee.firstName} ${ev.readyRecordedByEmployee.lastName}`.trim()
        : ev?.readyRecordedBy?.displayName ?? null;
      const startedName = ev?.startedRecordedByEmployee
        ? `${ev.startedRecordedByEmployee.firstName} ${ev.startedRecordedByEmployee.lastName}`.trim()
        : ev?.startedRecordedBy?.displayName ?? null;
      return [
        slot.mealType,
        {
          ready: {
            occurredAt: ev?.mealServiceReadyAt?.toISOString() ?? null,
            recordedAt: ev?.readyRecordedAt?.toISOString() ?? null,
            recordedByLabel: readyName,
            corrected: corrected.has("READY"),
          },
          started: {
            occurredAt: ev?.mealServiceStartedAt?.toISOString() ?? null,
            recordedAt: ev?.startedRecordedAt?.toISOString() ?? null,
            recordedByLabel: startedName,
            corrected: corrected.has("SERVICE_STARTED"),
          },
        },
      ];
    }),
  );

  const conflictRows = conflicts.map((row) => {
    const payload = row.commandPayload as {
      mealType?: string;
      commandType?: string;
      occurredAt?: string;
    };
    return {
      clientCommandId: row.clientCommandId,
      conflictCategory: row.conflictCategory,
      mealType: payload.mealType ?? "UNKNOWN",
      commandType: payload.commandType ?? "UNKNOWN",
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
    };
  });

  return (
    <div className="space-y-3">
      {conflictRows.length > 0 && canCorrect ? (
        <OfflineConflictReview unitId={input.unitId} conflicts={conflictRows} />
      ) : null}
      <OfflineServeryControls
        unitId={input.unitId}
        facilityId={input.session.facilityId}
        sessionVersion={input.session.sessionVersion ?? 0}
        actorRef={actorRefForSession(input.session)}
        deviceFacilityId={cookieJar.get(DEVICE_FACILITY_COOKIE)?.value?.trim() || null}
        deviceBoundUnitId={deviceBoundUnitId}
        defaultMealType={recordableMealForContext(mealServiceContext)?.mealType ?? null}
        returnTab="overview"
        returnLogTab=""
        slots={unit.mealTimes}
        contextNote={describeMealServiceContext(mealServiceContext)}
        canRecord={canRecord}
        canCorrect={canCorrect}
        eventByMeal={eventByMeal}
      />
    </div>
  );
}

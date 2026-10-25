import { cookies } from "next/headers";

import { OfflineConflictReview } from "@/components/offline/offline-conflict-review";
import { OfflineServeryControls } from "@/components/offline/offline-servery-controls";
import { sessionUserIdForFk, type AppJwtPayload } from "@/lib/auth"
import type { FacilitySession } from "@/lib/auth";
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
import {
  isCurrentPeriodModel,
  loadPublishedRunModel,
  resolveRunPresentationDepartment,
} from "@/lib/operational-cycles";

export async function renderServeryActionChrome(input: {
  session: FacilitySession;
  unitId: string;
  timezone: string;
  now: Date;
}) {
  const serviceDate = getFacilityServiceDate(input.timezone, input.now);
  const dateKey = toServiceDateKey(serviceDate);
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const runDepartment = await resolveRunPresentationDepartment({
    facilityId: input.session.facilityId,
    activeDepartmentId: null,
    unitId: input.unitId,
  });
  const runModel = runDepartment
    ? await loadPublishedRunModel({
        facilityId: input.session.facilityId,
        departmentId: runDepartment.id,
        now: input.now,
      })
    : null;
  const hideLegacyMealControls =
    Boolean(runModel) && isCurrentPeriodModel(runModel?.provenance);

  const [unit, events, conflicts] = await Promise.all([
    prisma.unit.findFirst({
      where: { id: input.unitId, facilityId: input.session.facilityId },
      select: {
        unitType: true,
      },
    }),
    Promise.resolve([]),
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
    mealTimes: [],
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

  const eventByMeal = {};
  void events;

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

  if (hideLegacyMealControls && conflictRows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {conflictRows.length > 0 && canCorrect ? (
        <OfflineConflictReview unitId={input.unitId} conflicts={conflictRows} />
      ) : null}
      {hideLegacyMealControls ? null : (
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
          slots={[]}
          contextNote={describeMealServiceContext(mealServiceContext)}
          canRecord={canRecord}
          canCorrect={canCorrect}
          eventByMeal={eventByMeal}
        />
      )}
    </div>
  );
}

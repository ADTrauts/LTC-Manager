-- Operational Cycle scope (Room Type + mixed Unit/Room targets)
-- and versioned configured milestone times at Neighborhood/Unit grain.
-- Additive. Does not drop UnitMealTime. Does not touch Operational Profiles.

ALTER TYPE "OperationalCycleLocationMode" ADD VALUE 'ROOM_TYPE';

ALTER TABLE "DepartmentOperationalCycle" ADD COLUMN "roomTypeKey" TEXT;

CREATE INDEX "DepartmentOperationalCycle_departmentId_roomTypeKey_idx"
  ON "DepartmentOperationalCycle"("departmentId", "roomTypeKey");

ALTER TABLE "DepartmentOperationalCycleLocation" ALTER COLUMN "unitId" DROP NOT NULL;
ALTER TABLE "DepartmentOperationalCycleLocation" ADD COLUMN "spaceId" TEXT;

CREATE UNIQUE INDEX "DepartmentOperationalCycleLocation_cycleId_spaceId_key"
  ON "DepartmentOperationalCycleLocation"("cycleId", "spaceId");

CREATE INDEX "DepartmentOperationalCycleLocation_spaceId_idx"
  ON "DepartmentOperationalCycleLocation"("spaceId");

ALTER TABLE "DepartmentOperationalCycleLocation"
  ADD CONSTRAINT "DepartmentOperationalCycleLocation_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentOperationalCycleLocation"
  ADD CONSTRAINT "DepartmentOperationalCycleLocation_target_xor"
  CHECK (
    (("unitId" IS NOT NULL) AND ("spaceId" IS NULL))
    OR (("unitId" IS NULL) AND ("spaceId" IS NOT NULL))
  );

CREATE TABLE "DepartmentOperationalCycleMilestoneTime" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "milestone" "ServeryMilestone" NOT NULL,
    "configuredTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentOperationalCycleMilestoneTime_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentOperationalCycleMilestoneTime_cycleId_unitId_milestone_key"
  ON "DepartmentOperationalCycleMilestoneTime"("cycleId", "unitId", "milestone");

CREATE INDEX "DepartmentOperationalCycleMilestoneTime_unitId_idx"
  ON "DepartmentOperationalCycleMilestoneTime"("unitId");

ALTER TABLE "DepartmentOperationalCycleMilestoneTime"
  ADD CONSTRAINT "DepartmentOperationalCycleMilestoneTime_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartmentOperationalCycleMilestoneTime"
  ADD CONSTRAINT "DepartmentOperationalCycleMilestoneTime_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Conservative backfill: copy UnitMealTime onto the single unambiguous current
-- published SERVICE cycle for that facility + department + mealType.
-- Skip when more than one matching published current cycle exists.
INSERT INTO "DepartmentOperationalCycleMilestoneTime" (
  "id",
  "cycleId",
  "unitId",
  "milestone",
  "configuredTime",
  "createdAt",
  "updatedAt"
)
SELECT
  'cmt' || substr(md5(c."id" || umt."unitId" || umt."mealType"), 1, 22),
  c."id",
  umt."unitId",
  'SERVICE_STARTED'::"ServeryMilestone",
  umt."scheduledTime",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "UnitMealTime" umt
JOIN "Unit" u ON u."id" = umt."unitId"
JOIN "UnitDepartmentResponsibility" udr ON udr."unitId" = u."id"
JOIN "DepartmentOperationalCycle" c
  ON c."departmentId" = udr."departmentId"
 AND c."facilityId" = u."facilityId"
 AND c."mealType" = umt."mealType"
 AND c."cycleType" = 'SERVICE'
 AND c."status" = 'PUBLISHED'
 AND c."effectiveTo" IS NULL
 AND 'SERVICE_STARTED' = ANY (c."expectedMilestones")
WHERE umt."isActive" = true
  AND u."hierarchyRole" IS DISTINCT FROM 'FLOOR'
  AND (
    SELECT COUNT(*)::int
    FROM "DepartmentOperationalCycle" c2
    WHERE c2."departmentId" = c."departmentId"
      AND c2."facilityId" = c."facilityId"
      AND c2."mealType" = c."mealType"
      AND c2."cycleType" = 'SERVICE'
      AND c2."status" = 'PUBLISHED'
      AND c2."effectiveTo" IS NULL
      AND 'SERVICE_STARTED' = ANY (c2."expectedMilestones")
  ) = 1
ON CONFLICT ("cycleId", "unitId", "milestone") DO NOTHING;

-- CreateTable
CREATE TABLE "KioskUnitPinLoginEvent" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "unassignedToUnit" BOOLEAN NOT NULL,
    "clientIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KioskUnitPinLoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KioskUnitPinLoginEvent_facilityId_createdAt_idx" ON "KioskUnitPinLoginEvent"("facilityId", "createdAt");

-- CreateIndex
CREATE INDEX "KioskUnitPinLoginEvent_employeeId_createdAt_idx" ON "KioskUnitPinLoginEvent"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "KioskUnitPinLoginEvent_unitId_createdAt_idx" ON "KioskUnitPinLoginEvent"("unitId", "createdAt");

-- AddForeignKey
ALTER TABLE "KioskUnitPinLoginEvent" ADD CONSTRAINT "KioskUnitPinLoginEvent_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskUnitPinLoginEvent" ADD CONSTRAINT "KioskUnitPinLoginEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskUnitPinLoginEvent" ADD CONSTRAINT "KioskUnitPinLoginEvent_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

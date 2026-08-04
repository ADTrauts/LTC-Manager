-- Control which departments appear in employee HR UI (Admin → Departments).
ALTER TABLE "Department" ADD COLUMN "showInEmployeeApp" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Department_facilityId_showInEmployeeApp_idx" ON "Department"("facilityId", "showInEmployeeApp");

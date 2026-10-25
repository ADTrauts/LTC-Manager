-- A call-off marks the canonical shift. Additive only.
ALTER TABLE "ScheduleEntry" ADD COLUMN "calledOffAt" TIMESTAMP(3),
ADD COLUMN "callOffReason" TEXT;

-- Export governance metadata remains available while operational writes are paused.
-- No export file, report payload or customer content is copied into these tables.
CREATE TABLE "CustomerRecordExportRequest" (
 "id" UUID PRIMARY KEY, "facilityId" TEXT NOT NULL, "requesterId" TEXT NOT NULL,
 "requesterLabel" TEXT NOT NULL, "departmentId" TEXT NOT NULL, "recordKey" TEXT NOT NULL,
 "fromDate" VARCHAR(10) NOT NULL, "toDate" VARCHAR(10) NOT NULL,
 "format" VARCHAR(4) NOT NULL CHECK ("format" IN ('csv','xlsx')),
 "dataList" JSONB NOT NULL,
 "manifestVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("manifestVersion"=1),
 "fingerprint" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING'
 CHECK ("status" IN ('PENDING','APPROVED','DENIED','CANCELLED','REVOKED')),
 "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision">=0),
 "approvedById" TEXT, "approvedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("status" <> 'APPROVED' OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL AND "expiresAt" IS NOT NULL AND "expiresAt"="approvedAt"+INTERVAL '24 hours'))
);
CREATE INDEX "CustomerRecordExportRequest_facilityId_requesterId_createdAt_idx" ON "CustomerRecordExportRequest"("facilityId","requesterId","createdAt");
CREATE INDEX "CustomerRecordExportRequest_status_createdAt_idx" ON "CustomerRecordExportRequest"("status","createdAt");
CREATE TABLE "CustomerRecordExportEvent" (
 "id" TEXT PRIMARY KEY, "requestId" UUID NOT NULL REFERENCES "CustomerRecordExportRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "action" TEXT NOT NULL CHECK ("action" IN ('REQUESTED','APPROVED','DENIED','CANCELLED','REVOKED','GENERATED')),
 "actorId" TEXT NOT NULL, "actorKind" TEXT NOT NULL CHECK ("actorKind" IN ('CUSTOMER','OWNER')),
 "artifactHash" TEXT, "byteCount" INTEGER, "recordCount" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CustomerRecordExportEvent_requestId_createdAt_idx" ON "CustomerRecordExportEvent"("requestId","createdAt");
CREATE FUNCTION protect_customer_export_scope() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."facilityId",NEW."requesterId",NEW."requesterLabel",NEW."departmentId",NEW."recordKey",NEW."fromDate",NEW."toDate",NEW."format",NEW."dataList",NEW."manifestVersion",NEW."fingerprint",NEW."createdAt")
 IS DISTINCT FROM ROW(OLD."facilityId",OLD."requesterId",OLD."requesterLabel",OLD."departmentId",OLD."recordKey",OLD."fromDate",OLD."toDate",OLD."format",OLD."dataList",OLD."manifestVersion",OLD."fingerprint",OLD."createdAt") THEN
 RAISE EXCEPTION 'Export scope is immutable; submit a new request' USING ERRCODE='23514';
 END IF;
 IF OLD."status"<>'PENDING' AND NEW."status"='APPROVED' THEN
 RAISE EXCEPTION 'Approval cannot be renewed; submit a new request' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_customer_export_scope BEFORE UPDATE ON "CustomerRecordExportRequest" FOR EACH ROW EXECUTE FUNCTION protect_customer_export_scope();

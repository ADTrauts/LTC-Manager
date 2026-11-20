-- Offboarding coordination only. No existing customer state, contract, access or data is changed.
CREATE TABLE "CustomerOffboardingRequest" (
 "id" UUID PRIMARY KEY,
 "facilityId" TEXT NOT NULL REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requesterId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requesterLabel" VARCHAR(100) NOT NULL,
 "requestedDate" VARCHAR(10) NOT NULL CHECK ("requestedDate" ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$'),
 "facilityTimezone" VARCHAR(100) NOT NULL,
 "reason" VARCHAR(1000) NOT NULL CHECK (char_length(btrim("reason")) BETWEEN 8 AND 1000),
 "fingerprint" VARCHAR(64) NOT NULL CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
 "status" TEXT NOT NULL DEFAULT 'REQUESTED' CHECK ("status" IN ('REQUESTED','PLAN_READY','ACKNOWLEDGED','WITHDRAWN','DECLINED')),
 "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
 "planVersion" INTEGER NOT NULL DEFAULT 0 CHECK ("planVersion" >= 0),
 "plan" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("planVersion"=0 AND "plan" IS NULL) OR ("planVersion">0 AND "plan" IS NOT NULL AND jsonb_typeof("plan")='object')),
 CHECK ("status" NOT IN ('PLAN_READY','ACKNOWLEDGED') OR "planVersion">0)
);
CREATE INDEX "CustomerOffboardingRequest_facilityId_requesterId_createdAt_idx" ON "CustomerOffboardingRequest"("facilityId","requesterId","createdAt");
CREATE INDEX "CustomerOffboardingRequest_status_createdAt_idx" ON "CustomerOffboardingRequest"("status","createdAt");
CREATE UNIQUE INDEX "CustomerOffboardingRequest_one_open_facility" ON "CustomerOffboardingRequest"("facilityId") WHERE "status" IN ('REQUESTED','PLAN_READY','ACKNOWLEDGED');
CREATE TABLE "CustomerOffboardingEvent" (
 "id" UUID PRIMARY KEY,
 "requestId" UUID NOT NULL REFERENCES "CustomerOffboardingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "revision" INTEGER NOT NULL CHECK ("revision">=0),
 "fingerprint" VARCHAR(64) NOT NULL CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
 "action" TEXT NOT NULL CHECK ("action" IN ('REQUESTED','PLAN_PUBLISHED','PLAN_ACKNOWLEDGED','WITHDRAWN','DECLINED')),
 "actorId" TEXT NOT NULL,
 "actorKind" TEXT NOT NULL CHECK ("actorKind" IN ('CUSTOMER','OWNER')),
 "actorLabel" VARCHAR(100) NOT NULL,
 "detail" JSONB NOT NULL CHECK (jsonb_typeof("detail")='object'),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("requestId","revision"),
 CHECK (("actorKind"='OWNER' AND "action" IN ('PLAN_PUBLISHED','DECLINED')) OR ("actorKind"='CUSTOMER' AND "action" IN ('REQUESTED','PLAN_ACKNOWLEDGED','WITHDRAWN')))
);
CREATE INDEX "CustomerOffboardingEvent_requestId_createdAt_idx" ON "CustomerOffboardingEvent"("requestId","createdAt");

CREATE FUNCTION protect_customer_offboarding_request() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Offboarding history has no deletion command' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."status"<>'REQUESTED' OR NEW."revision"<>0 OR NEW."planVersion"<>0 OR NEW."plan" IS NOT NULL THEN
   RAISE EXCEPTION 'Offboarding must begin as a new request' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW."id",NEW."facilityId",NEW."requesterId",NEW."requesterLabel",NEW."requestedDate",NEW."facilityTimezone",NEW."reason",NEW."fingerprint",NEW."createdAt")
 IS DISTINCT FROM ROW(OLD."id",OLD."facilityId",OLD."requesterId",OLD."requesterLabel",OLD."requestedDate",OLD."facilityTimezone",OLD."reason",OLD."fingerprint",OLD."createdAt") THEN
  RAISE EXCEPTION 'Offboarding request scope is immutable' USING ERRCODE='23514'; END IF;
 IF OLD."status" IN ('WITHDRAWN','DECLINED') OR NEW."revision"<>OLD."revision"+1 THEN
  RAISE EXCEPTION 'Offboarding revision or transition is invalid' USING ERRCODE='23514'; END IF;
 IF NEW."status"='PLAN_READY' THEN
  IF NEW."planVersion"<>OLD."planVersion"+1 OR NEW."plan" IS NULL THEN
   RAISE EXCEPTION 'A changed plan needs a new version and acknowledgment' USING ERRCODE='23514'; END IF;
 ELSIF NEW."status" IN ('WITHDRAWN','DECLINED') OR (NEW."status"='ACKNOWLEDGED' AND OLD."status"='PLAN_READY') THEN
  IF NEW."planVersion"<>OLD."planVersion" OR NEW."plan" IS DISTINCT FROM OLD."plan" THEN
   RAISE EXCEPTION 'This transition cannot edit the plan' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'Unsupported offboarding transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_customer_offboarding_request BEFORE INSERT OR UPDATE OR DELETE ON "CustomerOffboardingRequest" FOR EACH ROW EXECUTE FUNCTION protect_customer_offboarding_request();
CREATE FUNCTION protect_customer_offboarding_event() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Offboarding receipts are append-only' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER protect_customer_offboarding_event BEFORE UPDATE OR DELETE ON "CustomerOffboardingEvent" FOR EACH ROW EXECUTE FUNCTION protect_customer_offboarding_event();

-- A request transition cannot commit without its exact revision's receipt. Events retain each plan version.
CREATE FUNCTION require_customer_offboarding_receipt() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE expected_action TEXT; receipt "CustomerOffboardingEvent"%ROWTYPE;
BEGIN
 expected_action := CASE NEW."status" WHEN 'REQUESTED' THEN 'REQUESTED' WHEN 'PLAN_READY' THEN 'PLAN_PUBLISHED'
  WHEN 'ACKNOWLEDGED' THEN 'PLAN_ACKNOWLEDGED' ELSE NEW."status" END;
 SELECT * INTO receipt FROM "CustomerOffboardingEvent" WHERE "requestId"=NEW."id" AND "revision"=NEW."revision";
 IF NOT FOUND OR receipt."action"<>expected_action OR (receipt."detail"->>'planVersion')::integer IS DISTINCT FROM NEW."planVersion" OR
  (expected_action='PLAN_PUBLISHED' AND receipt."detail"->'plan' IS DISTINCT FROM NEW."plan") OR
  (receipt."actorKind"='CUSTOMER' AND receipt."actorId"<>NEW."requesterId") THEN
  RAISE EXCEPTION 'Offboarding transition requires its matching receipt' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER require_customer_offboarding_receipt AFTER INSERT OR UPDATE ON "CustomerOffboardingRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_customer_offboarding_receipt();

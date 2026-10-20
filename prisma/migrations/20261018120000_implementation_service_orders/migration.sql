-- CreateTable
CREATE TABLE "ImplementationEngagement" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "responsibleStaffId" TEXT,
    "supportTicketId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "deliveryRevision" INTEGER NOT NULL DEFAULT 0,
    "acceptedRevision" INTEGER,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "requestedScope" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImplementationEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationOrder" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "scope" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "waivedByStaffId" TEXT,
    "waiverReason" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'QUOTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImplementationOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationPaymentAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "checkoutSessionId" TEXT,
    "paymentIntentId" TEXT,
    "checkoutUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImplementationPaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationParticipant" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "userId" TEXT,
    "staffId" TEXT,

    CONSTRAINT "ImplementationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationEvent" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorStaffId" TEXT,
    "providerEventId" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImplementationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationImportLink" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImplementationImportLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationEngagement_supportTicketId_key" ON "ImplementationEngagement"("supportTicketId");

-- CreateIndex
CREATE INDEX "ImplementationEngagement_facilityId_createdAt_idx" ON "ImplementationEngagement"("facilityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationOrder_engagementId_revision_key" ON "ImplementationOrder"("engagementId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationPaymentAttempt_idempotencyKey_key" ON "ImplementationPaymentAttempt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationPaymentAttempt_checkoutSessionId_key" ON "ImplementationPaymentAttempt"("checkoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationPaymentAttempt_paymentIntentId_key" ON "ImplementationPaymentAttempt"("paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationPaymentAttempt_orderId_sequence_key" ON "ImplementationPaymentAttempt"("orderId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationParticipant_engagementId_userId_key" ON "ImplementationParticipant"("engagementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationParticipant_engagementId_staffId_key" ON "ImplementationParticipant"("engagementId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationEvent_providerEventId_key" ON "ImplementationEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "ImplementationEvent_engagementId_createdAt_idx" ON "ImplementationEvent"("engagementId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationImportLink_batchId_key" ON "ImplementationImportLink"("batchId");

-- AddForeignKey
ALTER TABLE "ImplementationEngagement" ADD CONSTRAINT "ImplementationEngagement_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEngagement" ADD CONSTRAINT "ImplementationEngagement_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEngagement" ADD CONSTRAINT "ImplementationEngagement_responsibleStaffId_fkey" FOREIGN KEY ("responsibleStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEngagement" ADD CONSTRAINT "ImplementationEngagement_supportTicketId_fkey" FOREIGN KEY ("supportTicketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEngagement" ADD CONSTRAINT "ImplementationEngagement_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationOrder" ADD CONSTRAINT "ImplementationOrder_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "ImplementationEngagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationOrder" ADD CONSTRAINT "ImplementationOrder_waivedByStaffId_fkey" FOREIGN KEY ("waivedByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationOrder" ADD CONSTRAINT "ImplementationOrder_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationPaymentAttempt" ADD CONSTRAINT "ImplementationPaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ImplementationOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationParticipant" ADD CONSTRAINT "ImplementationParticipant_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "ImplementationEngagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationParticipant" ADD CONSTRAINT "ImplementationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationParticipant" ADD CONSTRAINT "ImplementationParticipant_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEvent" ADD CONSTRAINT "ImplementationEvent_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "ImplementationEngagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEvent" ADD CONSTRAINT "ImplementationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEvent" ADD CONSTRAINT "ImplementationEvent_actorStaffId_fkey" FOREIGN KEY ("actorStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationImportLink" ADD CONSTRAINT "ImplementationImportLink_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "ImplementationEngagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationImportLink" ADD CONSTRAINT "ImplementationImportLink_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SetupImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Real principals only; provider settlement is explicitly a system actor.
ALTER TABLE "ImplementationParticipant" ADD CONSTRAINT "ImplementationParticipant_principal" CHECK (("userId" IS NOT NULL)::int + ("staffId" IS NOT NULL)::int = 1);
ALTER TABLE "ImplementationEvent" ADD CONSTRAINT "ImplementationEvent_actor" CHECK (
 ("actorKind"='customer' AND "actorUserId" IS NOT NULL AND "actorStaffId" IS NULL) OR
 ("actorKind"='staff' AND "actorStaffId" IS NOT NULL AND "actorUserId" IS NULL) OR
 ("actorKind"='provider' AND "actorUserId" IS NULL AND "actorStaffId" IS NULL)
);
ALTER TABLE "ImplementationOrder" ADD CONSTRAINT "ImplementationOrder_price_approval" CHECK (
 "amountCents">=0 AND "currency"='usd' AND "revision">0 AND
 (("approvedAt" IS NULL AND "approvedByUserId" IS NULL) OR ("approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL)) AND
 (("waivedByStaffId" IS NULL AND "waiverReason" IS NULL AND "amountCents">0) OR ("waivedByStaffId" IS NOT NULL AND length(trim("waiverReason"))>=3 AND "amountCents"=0))
);
ALTER TABLE "ImplementationPaymentAttempt" ADD CONSTRAINT "ImplementationPaymentAttempt_status" CHECK ("status" IN ('PREPARED','UNKNOWN','OPEN','PAID','EXPIRED'));
CREATE UNIQUE INDEX "ImplementationPaymentAttempt_one_unresolved" ON "ImplementationPaymentAttempt" ("orderId") WHERE "status" <> 'EXPIRED';
CREATE FUNCTION "implementation_event_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Implementation evidence is append-only'; END $$;
CREATE TRIGGER "ImplementationEvent_append_only" BEFORE UPDATE OR DELETE ON "ImplementationEvent" FOR EACH ROW EXECUTE FUNCTION "implementation_event_append_only"();
CREATE FUNCTION "implementation_order_immutable_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."engagementId",NEW."revision",NEW."scope",NEW."digest",NEW."amountCents",NEW."currency",NEW."waivedByStaffId",NEW."waiverReason") IS DISTINCT FROM ROW(OLD."engagementId",OLD."revision",OLD."scope",OLD."digest",OLD."amountCents",OLD."currency",OLD."waivedByStaffId",OLD."waiverReason") THEN RAISE EXCEPTION 'Quoted scope and price are immutable'; END IF;
 IF OLD."approvedAt" IS NOT NULL AND ROW(NEW."approvedAt",NEW."approvedByUserId") IS DISTINCT FROM ROW(OLD."approvedAt",OLD."approvedByUserId") THEN RAISE EXCEPTION 'Customer approval is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ImplementationOrder_immutable_scope" BEFORE UPDATE ON "ImplementationOrder" FOR EACH ROW EXECUTE FUNCTION "implementation_order_immutable_scope"();

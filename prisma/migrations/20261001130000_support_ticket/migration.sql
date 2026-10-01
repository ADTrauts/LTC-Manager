-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('NEW', 'OPEN', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportTicketType" AS ENUM ('SUPPORT', 'BUG', 'FEATURE_REQUEST', 'IMPROVEMENT', 'ACCOUNT_ACCESS', 'BILLING', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SupportTicketMessageKind" AS ENUM ('INBOUND', 'OUTBOUND', 'NOTE');

-- CreateEnum
CREATE TYPE "SupportMessageDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "SupportTicketEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'ASSIGNMENT_CHANGED', 'PRIORITY_CHANGED', 'TYPE_CHANGED', 'FACILITY_CHANGED', 'CONTACT_CHANGED', 'SUBJECT_CHANGED');

-- CreateTable
CREATE TABLE "SupportContact" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "userId" TEXT,
    "facilityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "replyToken" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'NEW',
    "type" "SupportTicketType",
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
    "contactId" TEXT NOT NULL,
    "facilityId" TEXT,
    "assignedStaffId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "kind" "SupportTicketMessageKind" NOT NULL,
    "authorStaffId" TEXT,
    "contactId" TEXT,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "strippedReplyText" TEXT,
    "fromEmail" TEXT,
    "fromName" TEXT,
    "toEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "replyTo" TEXT,
    "subject" TEXT,
    "internetMessageId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "providerMessageId" TEXT,
    "inboundHeaders" JSONB,
    "attachmentManifest" JSONB,
    "deliveryStatus" "SupportMessageDeliveryStatus",
    "deliveryError" TEXT,
    "sentAt" TIMESTAMP(3),
    "clientSubmissionId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "type" "SupportTicketEventType" NOT NULL,
    "actorStaffId" TEXT,
    "causedByMessageId" TEXT,
    "fromValue" TEXT,
    "toValue" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportContact_email_key" ON "SupportContact"("email");

-- CreateIndex
CREATE INDEX "SupportContact_userId_idx" ON "SupportContact"("userId");

-- CreateIndex
CREATE INDEX "SupportContact_facilityId_idx" ON "SupportContact"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_replyToken_key" ON "SupportTicket"("replyToken");

-- CreateIndex
CREATE INDEX "SupportTicket_status_updatedAt_idx" ON "SupportTicket"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedStaffId_status_idx" ON "SupportTicket"("assignedStaffId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_facilityId_idx" ON "SupportTicket"("facilityId");

-- CreateIndex
CREATE INDEX "SupportTicket_contactId_idx" ON "SupportTicket"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicketMessage_providerMessageId_key" ON "SupportTicketMessage"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicketMessage_clientSubmissionId_key" ON "SupportTicketMessage"("clientSubmissionId");

-- CreateIndex
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketMessage_internetMessageId_idx" ON "SupportTicketMessage"("internetMessageId");

-- CreateIndex
CREATE INDEX "SupportTicketEvent_ticketId_createdAt_idx" ON "SupportTicketEvent"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportContact" ADD CONSTRAINT "SupportContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportContact" ADD CONSTRAINT "SupportContact_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SupportContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_authorStaffId_fkey" FOREIGN KEY ("authorStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SupportContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_actorStaffId_fkey" FOREIGN KEY ("actorStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_causedByMessageId_fkey" FOREIGN KEY ("causedByMessageId") REFERENCES "SupportTicketMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reply tokens become an email local-part suffix (support+{token}@…), so they must stay
-- lowercase hex and short enough for the 64-octet local-part limit.
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_replyToken_format_check"
  CHECK ("replyToken" ~ '^[0-9a-f]{32,40}$');

-- Per-kind message invariants.
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_inbound_check" CHECK (
  "kind" <> 'INBOUND' OR (
    "contactId" IS NOT NULL
    AND "authorStaffId" IS NULL
    AND "deliveryStatus" IS NULL
    AND "deliveryError" IS NULL
    AND "sentAt" IS NULL
  )
);

ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_outbound_check" CHECK (
  "kind" <> 'OUTBOUND' OR (
    "authorStaffId" IS NOT NULL
    AND "deliveryStatus" IS NOT NULL
    AND "clientSubmissionId" IS NOT NULL
    AND "receivedAt" IS NULL
    AND "strippedReplyText" IS NULL
    AND "inboundHeaders" IS NULL
  )
);

ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_note_check" CHECK (
  "kind" <> 'NOTE' OR (
    "authorStaffId" IS NOT NULL
    AND "contactId" IS NULL
    AND "deliveryStatus" IS NULL
    AND "deliveryError" IS NULL
    AND "sentAt" IS NULL
    AND "receivedAt" IS NULL
    AND "bodyHtml" IS NULL
    AND "strippedReplyText" IS NULL
    AND "fromEmail" IS NULL
    AND "fromName" IS NULL
    AND "replyTo" IS NULL
    AND "subject" IS NULL
    AND "internetMessageId" IS NULL
    AND "inReplyTo" IS NULL
    AND "providerMessageId" IS NULL
    AND "inboundHeaders" IS NULL
    AND "attachmentManifest" IS NULL
    AND COALESCE(cardinality("toEmails"), 0) = 0
    AND COALESCE(cardinality("ccEmails"), 0) = 0
    AND COALESCE(cardinality("references"), 0) = 0
  )
);

-- ── Legacy ConsoleTicket → canonical support model ─────────────────────────────
-- Every statement below is a no-op when the legacy tables are empty.

-- One contact per normalized requester email. A user is linked only when exactly one active,
-- verified user has that address.
INSERT INTO "SupportContact" ("id", "email", "displayName", "userId", "facilityId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  legacy.email,
  legacy."displayName",
  matched."userId",
  matched."facilityId",
  legacy."createdAt",
  CURRENT_TIMESTAMP
FROM (
  SELECT
    lower(btrim(t."requesterEmail")) AS email,
    (array_agg(btrim(t."requesterName") ORDER BY t."createdAt", t."id")
      FILTER (WHERE NULLIF(btrim(t."requesterName"), '') IS NOT NULL))[1] AS "displayName",
    min(t."createdAt") AS "createdAt"
  FROM "ConsoleTicket" t
  GROUP BY lower(btrim(t."requesterEmail"))
) legacy
LEFT JOIN LATERAL (
  SELECT min(u."id") AS "userId", min(u."facilityId") AS "facilityId"
  FROM "User" u
  WHERE lower(u."email") = legacy.email
    AND u."isActive" = true
    AND u."emailVerifiedAt" IS NOT NULL
  HAVING count(*) = 1
) matched ON true;

-- Ticket ids are preserved so existing /console/tickets/{id} URLs keep working. Numbers are
-- assigned in createdAt order.
INSERT INTO "SupportTicket" (
  "id", "number", "replyToken", "subject", "status", "type", "priority", "contactId",
  "facilityId", "assignedStaffId", "resolvedAt", "closedAt", "createdAt", "updatedAt"
)
SELECT
  t."id",
  1000 + row_number() OVER (ORDER BY t."createdAt", t."id"),
  substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 40),
  t."subject",
  t."status"::text::"SupportTicketStatus",
  NULL,
  'NORMAL',
  c."id",
  t."facilityId",
  NULL,
  t."resolvedAt",
  NULL,
  t."createdAt",
  t."updatedAt"
FROM "ConsoleTicket" t
JOIN "SupportContact" c ON c."email" = lower(btrim(t."requesterEmail"));

-- Next generated number is max(existing, 1000) + 1, so the first ticket is VSS-1001.
SELECT setval(
  pg_get_serial_sequence('"SupportTicket"', 'number'),
  GREATEST(1000, COALESCE((SELECT max("number") FROM "SupportTicket"), 1000)),
  true
);

-- Legacy status history was never recorded; it is not reconstructed.
INSERT INTO "SupportTicketEvent" ("id", "ticketId", "type", "actorStaffId", "metadata", "createdAt")
SELECT
  gen_random_uuid()::text,
  t."id",
  'CREATED',
  t."openedByStaffId",
  jsonb_build_object(
    'source', 'CONSOLE',
    'migratedFrom', 'ConsoleTicket',
    'legacyStatusHistory', 'not recorded'
  ),
  t."createdAt"
FROM "ConsoleTicket" t;

-- The earliest legacy message was the never-emailed opening note. Later messages were replies:
-- emailedAt set means Postmark accepted the send; null means it failed or email was off.
-- Postmark MessageID, RFC Message-ID, sender and subject were never stored and stay null.
INSERT INTO "SupportTicketMessage" (
  "id", "ticketId", "kind", "authorStaffId", "bodyText", "toEmails",
  "deliveryStatus", "deliveryError", "sentAt", "clientSubmissionId", "createdAt"
)
SELECT
  m."id",
  m."ticketId",
  (CASE WHEN m.rn = 1 THEN 'NOTE' ELSE 'OUTBOUND' END)::"SupportTicketMessageKind",
  m."authorStaffId",
  m."body",
  CASE WHEN m.rn = 1 THEN ARRAY[]::TEXT[] ELSE ARRAY[lower(btrim(t."requesterEmail"))] END,
  (CASE
    WHEN m.rn = 1 THEN NULL
    WHEN m."emailedAt" IS NOT NULL THEN 'SENT'
    ELSE 'FAILED'
  END)::"SupportMessageDeliveryStatus",
  CASE WHEN m.rn > 1 AND m."emailedAt" IS NULL THEN 'Legacy: delivery not confirmed' END,
  CASE WHEN m.rn > 1 THEN m."emailedAt" END,
  CASE WHEN m.rn > 1 THEN 'legacy:' || m."id" END,
  m."createdAt"
FROM (
  SELECT
    msg.*,
    row_number() OVER (PARTITION BY msg."ticketId" ORDER BY msg."createdAt", msg."id") AS rn
  FROM "ConsoleTicketMessage" msg
) m
JOIN "ConsoleTicket" t ON t."id" = m."ticketId";


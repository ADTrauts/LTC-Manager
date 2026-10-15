-- Photos, files, and signatures as children of OperationalEvidenceRecord.
ALTER TYPE "OperationalEvidenceFieldType" ADD VALUE 'PHOTO';
ALTER TYPE "OperationalEvidenceFieldType" ADD VALUE 'FILE';
ALTER TYPE "OperationalEvidenceFieldType" ADD VALUE 'SIGNATURE';

CREATE TYPE "OperationalEvidenceAttachmentKind" AS ENUM ('PHOTO', 'FILE', 'SIGNATURE');

CREATE TABLE "OperationalEvidenceAttachment" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldKey" TEXT,
    "kind" "OperationalEvidenceAttachmentKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "displaySequence" INTEGER NOT NULL DEFAULT 0,
    "uploadedByUserId" TEXT,
    "uploadedByEmployeeId" TEXT,
    "uploadedByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalEvidenceAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationalEvidenceAttachment_recordId_displaySequence_idx" ON "OperationalEvidenceAttachment"("recordId", "displaySequence");
CREATE INDEX "OperationalEvidenceAttachment_facilityId_recordId_idx" ON "OperationalEvidenceAttachment"("facilityId", "recordId");

ALTER TABLE "OperationalEvidenceAttachment" ADD CONSTRAINT "OperationalEvidenceAttachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

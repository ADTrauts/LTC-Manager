-- Asset identification photos and Work Order context photos reuse Attachment.

ALTER TYPE "AttachmentParentKind" ADD VALUE 'ASSET';

ALTER TABLE "Attachment" ADD COLUMN "assetId" TEXT;

CREATE INDEX "Attachment_assetId_idx" ON "Attachment"("assetId");

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

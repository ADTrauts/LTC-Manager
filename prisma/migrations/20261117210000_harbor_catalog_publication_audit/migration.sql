-- CreateTable
CREATE TABLE "HarborCatalogPublicationAuditDetail" (
    "eventId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,

    CONSTRAINT "HarborCatalogPublicationAuditDetail_pkey" PRIMARY KEY ("eventId")
);

-- AddForeignKey
ALTER TABLE "HarborCatalogPublicationAuditDetail" ADD CONSTRAINT "HarborCatalogPublicationAuditDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HarborAuditEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

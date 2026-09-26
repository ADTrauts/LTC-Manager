-- Facility-wide adopt of a published Harbor Catalog LOG/CHECKLIST.
-- Place (LogAttachment / type default) stays local. Existing placements count as installed.

CREATE TABLE "FacilityCatalogInstall" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "catalogDefinitionId" TEXT NOT NULL,
    "catalogStableKey" TEXT NOT NULL,
    "catalogVersion" INTEGER NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityCatalogInstall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacilityCatalogInstall_facilityId_catalogStableKey_key"
ON "FacilityCatalogInstall"("facilityId", "catalogStableKey");

CREATE INDEX "FacilityCatalogInstall_catalogStableKey_idx"
ON "FacilityCatalogInstall"("catalogStableKey");

CREATE INDEX "FacilityCatalogInstall_catalogDefinitionId_idx"
ON "FacilityCatalogInstall"("catalogDefinitionId");

ALTER TABLE "FacilityCatalogInstall"
ADD CONSTRAINT "FacilityCatalogInstall_facilityId_fkey"
FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FacilityCatalogInstall"
ADD CONSTRAINT "FacilityCatalogInstall_catalogDefinitionId_fkey"
FOREIGN KEY ("catalogDefinitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "FacilityCatalogInstall" (
    "id",
    "facilityId",
    "catalogDefinitionId",
    "catalogStableKey",
    "catalogVersion",
    "installedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'fci_' || substr(md5(src."facilityId" || ':' || src."catalogStableKey"), 1, 21),
    src."facilityId",
    src."catalogDefinitionId",
    src."catalogStableKey",
    src."catalogVersion",
    src."installedAt",
    src."installedAt",
    src."installedAt"
FROM (
    SELECT DISTINCT ON ("facilityId", "catalogStableKey")
        "facilityId",
        "catalogDefinitionId",
        "catalogStableKey",
        "catalogVersion",
        "createdAt" AS "installedAt"
    FROM (
        SELECT
            "facilityId",
            "catalogDefinitionId",
            "catalogStableKey",
            "catalogVersion",
            "createdAt"
        FROM "LogAttachment"
        UNION ALL
        SELECT
            "facilityId",
            "catalogDefinitionId",
            "catalogStableKey",
            "catalogVersion",
            "createdAt"
        FROM "DepartmentFacilityTypeLogDefault"
    ) AS placements
    ORDER BY "facilityId", "catalogStableKey", "catalogVersion" DESC, "createdAt" ASC
) AS src;

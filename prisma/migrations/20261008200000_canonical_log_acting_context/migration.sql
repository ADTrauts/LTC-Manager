-- Historical acting context for canonical Log submit and correction.
-- Plain strings, not foreign keys: ending a partnership must not erase the action fact.
-- Null actingAccessKind remains the internal / pre-provenance convention.

ALTER TABLE "OperationalEvidenceRecord"
ADD COLUMN "actingAccessKind" TEXT,
ADD COLUMN "actingPartnerOrganizationId" TEXT,
ADD COLUMN "actingFacilityPartnerOrganizationId" TEXT,
ADD COLUMN "actingEffectivePartnerRole" "OrganizationPartnerRole";

ALTER TABLE "OperationalEvidenceRecord"
ADD CONSTRAINT "OperationalEvidenceRecord_acting_context_chk"
CHECK (
  "actingAccessKind" IS NULL
  OR (
    "actingAccessKind" = 'partner'
    AND "actingPartnerOrganizationId" IS NOT NULL
    AND "actingFacilityPartnerOrganizationId" IS NOT NULL
    AND "actingEffectivePartnerRole" IS NOT NULL
  )
);

ALTER TABLE "OperationalEvidenceCorrection"
ADD COLUMN "actingAccessKind" TEXT,
ADD COLUMN "actingPartnerOrganizationId" TEXT,
ADD COLUMN "actingFacilityPartnerOrganizationId" TEXT,
ADD COLUMN "actingEffectivePartnerRole" "OrganizationPartnerRole";

ALTER TABLE "OperationalEvidenceCorrection"
ADD CONSTRAINT "OperationalEvidenceCorrection_acting_context_chk"
CHECK (
  "actingAccessKind" IS NULL
  OR (
    "actingAccessKind" = 'partner'
    AND "actingPartnerOrganizationId" IS NOT NULL
    AND "actingFacilityPartnerOrganizationId" IS NOT NULL
    AND "actingEffectivePartnerRole" IS NOT NULL
  )
);

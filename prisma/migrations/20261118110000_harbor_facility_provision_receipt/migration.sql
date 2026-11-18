CREATE TABLE "HarborFacilityProvisionReceipt" (
    "requestKey" UUID NOT NULL,
    "staffId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HarborFacilityProvisionReceipt_pkey" PRIMARY KEY ("requestKey"),
    CONSTRAINT "HarborFacilityProvisionReceipt_fingerprint_check" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$')
);

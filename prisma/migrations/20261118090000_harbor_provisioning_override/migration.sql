CREATE TABLE "HarborProvisioningOverrideAuditDetail" (
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "matchedOrganizationIds" TEXT[] NOT NULL,
    "verificationBasis" TEXT NOT NULL,
    CONSTRAINT "HarborProvisioningOverrideAuditDetail_pkey" PRIMARY KEY ("eventId"),
    CONSTRAINT "HarborProvisioningOverrideAuditDetail_basis_check" CHECK (char_length(btrim("verificationBasis")) BETWEEN 8 AND 240),
    CONSTRAINT "HarborProvisioningOverrideAuditDetail_matches_check" CHECK (cardinality("matchedOrganizationIds") > 0),
    CONSTRAINT "HarborProvisioningOverrideAuditDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HarborAuditEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

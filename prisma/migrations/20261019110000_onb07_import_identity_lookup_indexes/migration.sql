-- Bound exact case-insensitive identity reads/locks without changing uniqueness,
-- merging accounts, modifying history, or narrowing ambiguity detection.
CREATE INDEX "User_lower_email_lookup_idx" ON "User" (lower("email"));
CREATE INDEX "Employee_facility_lower_email_lookup_idx" ON "Employee" ("facilityId", lower("email"));

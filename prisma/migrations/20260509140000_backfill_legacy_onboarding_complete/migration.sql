-- Facilities created before self-serve onboarding never set onboardingStartedAt.
-- Mark them complete so existing GMs are not trapped in /setup.
UPDATE "Facility"
SET
  "onboardingCompletedAt" = COALESCE("updatedAt", NOW()),
  "onboardingCurrentStep" = 'complete'
WHERE
  "onboardingCompletedAt" IS NULL
  AND "onboardingStartedAt" IS NULL;

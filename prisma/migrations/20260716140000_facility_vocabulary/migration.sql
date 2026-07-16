-- Facility Vocabulary: configurable hierarchy terminology (presentation only)

ALTER TABLE "Facility" ADD COLUMN "vocabularyProfile" TEXT;
ALTER TABLE "Facility" ADD COLUMN "vocabularyLevel1Label" TEXT;
ALTER TABLE "Facility" ADD COLUMN "vocabularyLevel2Label" TEXT;
ALTER TABLE "Facility" ADD COLUMN "vocabularyLevel3Label" TEXT;

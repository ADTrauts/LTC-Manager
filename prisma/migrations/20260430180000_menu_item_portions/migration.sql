CREATE TYPE "MenuItemEntryType" AS ENUM ('FIXED', 'CHOICE_PLACEHOLDER');

ALTER TABLE "MenuItem"
  ADD COLUMN "portionValue" TEXT,
  ADD COLUMN "portionUnit" TEXT,
  ADD COLUMN "entryType" "MenuItemEntryType" NOT NULL DEFAULT 'FIXED';

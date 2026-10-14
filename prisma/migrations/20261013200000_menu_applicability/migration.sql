-- Menu applicability: explicit Department locations + canonical Operational Cycle identities.
-- Additive only. Do not invent location or cycle assignments for existing Menus.

CREATE TABLE "MenuLocationApplicability" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "unitId" TEXT,
    "spaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuLocationApplicability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenuLocationApplicability_menuId_unitId_key"
  ON "MenuLocationApplicability"("menuId", "unitId");

CREATE UNIQUE INDEX "MenuLocationApplicability_menuId_spaceId_key"
  ON "MenuLocationApplicability"("menuId", "spaceId");

CREATE INDEX "MenuLocationApplicability_unitId_idx"
  ON "MenuLocationApplicability"("unitId");

CREATE INDEX "MenuLocationApplicability_spaceId_idx"
  ON "MenuLocationApplicability"("spaceId");

ALTER TABLE "MenuLocationApplicability"
  ADD CONSTRAINT "MenuLocationApplicability_menuId_fkey"
  FOREIGN KEY ("menuId") REFERENCES "Menu"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MenuLocationApplicability"
  ADD CONSTRAINT "MenuLocationApplicability_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MenuLocationApplicability"
  ADD CONSTRAINT "MenuLocationApplicability_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MenuLocationApplicability"
  ADD CONSTRAINT "MenuLocationApplicability_target_xor"
  CHECK (
    (("unitId" IS NOT NULL) AND ("spaceId" IS NULL))
    OR (("unitId" IS NULL) AND ("spaceId" IS NOT NULL))
  );

CREATE TABLE "MenuOperationalCycleApplicability" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "cycleStableKey" TEXT NOT NULL,
    "menuPeriodKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuOperationalCycleApplicability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenuOperationalCycleApplicability_menuId_cycleStableKey_key"
  ON "MenuOperationalCycleApplicability"("menuId", "cycleStableKey");

CREATE INDEX "MenuOperationalCycleApplicability_cycleStableKey_idx"
  ON "MenuOperationalCycleApplicability"("cycleStableKey");

ALTER TABLE "MenuOperationalCycleApplicability"
  ADD CONSTRAINT "MenuOperationalCycleApplicability_menuId_fkey"
  FOREIGN KEY ("menuId") REFERENCES "Menu"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  filterCatalogCardsToInstalled,
  ensureFacilityCatalogInstall,
} from "./facility-catalog-install";

test("filterCatalogCardsToInstalled keeps only adopted stable keys", () => {
  const cards = [
    { stableKey: "cooler_temperature_log", name: "Cooler" },
    { stableKey: "opening_checklist", name: "Opening" },
    { stableKey: "ice_machine_cleaning_log", name: "Ice" },
  ];
  assert.deepEqual(
    filterCatalogCardsToInstalled(cards, ["opening_checklist", "cooler_temperature_log"]).map(
      (card) => card.stableKey,
    ),
    ["cooler_temperature_log", "opening_checklist"],
  );
  assert.deepEqual(filterCatalogCardsToInstalled(cards, []), []);
});

test("ensureFacilityCatalogInstall is idempotent for the same facility + key", async () => {
  const store = new Map<string, { id: string }>();
  const client = {
    facilityCatalogInstall: {
      findUnique: async ({
        where,
      }: {
        where: { facilityId_catalogStableKey: { facilityId: string; catalogStableKey: string } };
      }) => {
        const key = `${where.facilityId_catalogStableKey.facilityId}:${where.facilityId_catalogStableKey.catalogStableKey}`;
        return store.get(key) ?? null;
      },
      create: async ({
        data,
      }: {
        data: { facilityId: string; catalogStableKey: string };
        select: { id: true };
      }) => {
        const key = `${data.facilityId}:${data.catalogStableKey}`;
        if (store.has(key)) {
          const err = new Error("Unique constraint") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row = { id: `install_${store.size + 1}` };
        store.set(key, row);
        return row;
      },
    },
  };

  const first = await ensureFacilityCatalogInstall(client as never, {
    facilityId: "fac_1",
    catalogDefinitionId: "cat_1",
    catalogStableKey: "cooler_temperature_log",
    catalogVersion: 1,
  });
  const second = await ensureFacilityCatalogInstall(client as never, {
    facilityId: "fac_1",
    catalogDefinitionId: "cat_1",
    catalogStableKey: "cooler_temperature_log",
    catalogVersion: 1,
  });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.id, second.id);
  assert.equal(store.size, 1);
});

test("Build Logs install verb and place from the installed library", () => {
  const browse = readFileSync(
    join(process.cwd(), "src/components/canonical-logs/catalog-browse-client.tsx"),
    "utf8",
  );
  const install = readFileSync(
    join(process.cwd(), "src/components/canonical-logs/catalog-install-button.tsx"),
    "utf8",
  );
  const page = readFileSync(join(process.cwd(), "src/app/(protected)/build/logs/page.tsx"), "utf8");
  const attach = readFileSync(
    join(process.cwd(), "src/lib/canonical-logs/load-target-build-context.ts"),
    "utf8",
  );
  const harbor = readFileSync(join(process.cwd(), "src/app/console/(staff)/catalog/page.tsx"), "utf8");
  assert.match(browse, /CatalogInstallButton/);
  assert.match(browse, /Place…/);
  assert.match(install, /data-testid="catalog-install"/);
  assert.match(page, /Install a log onto this facility, then place it/);
  assert.match(page, /tab=library/);
  assert.match(attach, /listInstalledCatalogStableKeys/);
  assert.match(harbor, /install them, then place them/);
});

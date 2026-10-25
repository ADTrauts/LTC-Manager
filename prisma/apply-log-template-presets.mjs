/**
 * The nine shipped log presets, matched to published Catalog definitions.
 * Seeds and provisioning install those Catalog records. They do not create
 * LogTemplate rows. Presets with no Catalog definition yet are left for LEG-02.
 */

/** @type {{ preset: string; catalogStableKey: string }[]} */
export const LOG_PRESET_CATALOG_MATCHES = [
  { preset: "Unit Cooler Temp Log", catalogStableKey: "cooler_temperature_log" },
  { preset: "Servery – Hot and cold holding", catalogStableKey: "food_temperature_log" },
  { preset: "Walk-in cooler temperature", catalogStableKey: "cooler_temperature_log" },
  { preset: "Walk-in freezer temperature", catalogStableKey: "freezer_temperature_log" },
  { preset: "Dishwashing – high-temp / machine", catalogStableKey: "high_temp_dishwasher_log" },
  { preset: "Receiving – TCS / cold chain", catalogStableKey: "receiving_temperature_log" },
  { preset: "Dry storage – ambient", catalogStableKey: "dietary_dry_storage_ambient" },
  { preset: "Restroom sanitation round", catalogStableKey: "evs_restroom_sanitation_round" },
  { preset: "Generator weekly run log", catalogStableKey: "plant_generator_weekly_run_log" },
];

/** Every shipped preset now has a Catalog definition. */
export const UNMATCHED_LOG_PRESETS = [];

export function matchedCatalogStableKeys() {
  return [...new Set(LOG_PRESET_CATALOG_MATCHES.map((row) => row.catalogStableKey))];
}

/**
 * Install the matched Catalog definitions on one facility.
 * Placement (a Log Attachment) stays a local choice.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ facilityId: string }} opts
 */
export async function installMatchedCatalogRecords(prisma, { facilityId }) {
  const keys = matchedCatalogStableKeys();
  for (const catalogStableKey of keys) {
    const catalog = await prisma.catalogLogDefinition.findFirst({
      where: { stableKey: catalogStableKey, status: "PUBLISHED" },
      orderBy: { version: "desc" },
      select: { id: true, stableKey: true, version: true },
    });
    if (!catalog) {
      throw new Error(`Published Catalog definition missing: ${catalogStableKey}`);
    }
    await prisma.facilityCatalogInstall.upsert({
      where: { facilityId_catalogStableKey: { facilityId, catalogStableKey } },
      update: {},
      create: {
        facilityId,
        catalogDefinitionId: catalog.id,
        catalogStableKey: catalog.stableKey,
        catalogVersion: catalog.version,
      },
    });
  }
}

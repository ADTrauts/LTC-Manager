/**
 * Facility Plant Operations starter configuration.
 * Optional, select-before-install, Facility-owned drafts, no auto-publish.
 * Presence is derived from presetKey / stableKey — no setup-complete flag.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { departmentAdminHref } from "@/lib/department-administration/admin-nav";
import {
  createDraftFromPreset as createWorkDraftFromPreset,
  PLANT_WORK_PRESET_KEYS,
  type WorkActor,
} from "@/lib/department-work";
import {
  createDraftFromPreset as createRecordDraftFromPreset,
  PLANT_RECORD_PRESET_KEYS,
  type EvidenceActor,
} from "@/lib/operational-evidence";
import { prisma } from "@/lib/prisma";

import {
  classifyPlantStarterPresence,
  listPlantStarterCatalog,
  type PlantStarterInstallResult,
  type PlantStarterItemId,
  type PlantStarterLoadItem,
  type PlantStarterPresence,
} from "./plant-starter-catalog";

export {
  classifyPlantStarterPresence,
  listPlantStarterCatalog,
  plantStarterHref,
  presentPlantStarterPresenceLabel,
  PLANT_STARTER_INTRO,
  PLANT_STARTER_PACKAGE_NAME,
  type PlantStarterCatalogItem,
  type PlantStarterInstallResult,
  type PlantStarterItemId,
  type PlantStarterKind,
  type PlantStarterLoadItem,
  type PlantStarterPresence,
} from "./plant-starter-catalog";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function loadPlantStarterInstalledKeys(
  input: { facilityId: string; departmentId: string; client?: DbClient },
): Promise<{ workPresetKeys: string[]; recordPresetKeys: string[] }> {
  const client = input.client ?? prisma;
  const [work, records] = await Promise.all([
    client.departmentWorkPlan.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        OR: [
          { presetKey: { in: [...PLANT_WORK_PRESET_KEYS] } },
          { stableKey: { in: [...PLANT_WORK_PRESET_KEYS] } },
        ],
      },
      select: { presetKey: true, stableKey: true },
    }),
    client.operationalTemplate.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        OR: [
          { presetKey: { in: [...PLANT_RECORD_PRESET_KEYS] } },
          { stableKey: { in: [...PLANT_RECORD_PRESET_KEYS] } },
        ],
      },
      select: { presetKey: true, stableKey: true },
    }),
  ]);

  return {
    workPresetKeys: uniqueKeys(work),
    recordPresetKeys: uniqueKeys(records),
  };
}

export async function loadPlantStarterState(input: {
  facilityId: string;
  departmentId: string;
  client?: DbClient;
}): Promise<{
  items: PlantStarterLoadItem[];
  presence: PlantStarterPresence;
}> {
  const installed = await loadPlantStarterInstalledKeys(input);
  const classified = classifyPlantStarterPresence(installed);
  const added = new Set(classified.addedIds);
  return {
    items: listPlantStarterCatalog().map((row) => ({
      ...row,
      alreadyAdded: added.has(row.id),
    })),
    presence: classified.status,
  };
}

export async function installPlantStarterConfiguration(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    selectedIds: readonly string[];
    actor: WorkActor & EvidenceActor;
    client?: DbClient;
  },
): Promise<PlantStarterInstallResult> {
  const catalog = new Map(listPlantStarterCatalog().map((row) => [row.id, row]));
  const selected = input.selectedIds.filter((id): id is PlantStarterItemId =>
    catalog.has(id as PlantStarterItemId),
  );
  const existing = await loadPlantStarterInstalledKeys(input);
  const already = new Set([...existing.workPresetKeys, ...existing.recordPresetKeys]);

  let workAdded = 0;
  let recordAdded = 0;
  let alreadyExisted = 0;

  for (const id of selected) {
    const item = catalog.get(id);
    if (!item) continue;
    if (already.has(id)) {
      alreadyExisted += 1;
      continue;
    }
    if (item.kind === "work") {
      await createWorkDraftFromPreset(session, {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        presetKey: id,
        actor: input.actor,
        client: input.client,
      });
      already.add(id);
      workAdded += 1;
      continue;
    }
    await createRecordDraftFromPreset(session, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      presetKey: id,
      actor: input.actor,
      client: input.client,
    });
    already.add(id);
    recordAdded += 1;
  }

  return {
    workAdded,
    recordAdded,
    alreadyExisted,
    selectedCount: selected.length,
    workHref: departmentAdminHref(input.departmentId, "work"),
    recordsHref: departmentAdminHref(input.departmentId, "records"),
  };
}

function uniqueKeys(rows: Array<{ presetKey: string | null; stableKey: string }>): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.presetKey) keys.add(row.presetKey);
    if (row.stableKey) keys.add(row.stableKey);
  }
  return [...keys];
}

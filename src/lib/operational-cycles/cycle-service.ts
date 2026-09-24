import type { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import {
  requireCycleManage,
  requireCyclePublish,
  resolveCycleAuthority,
} from "./cycle-authority";
import { wouldCreateHierarchyCycle } from "./cycle-hierarchy";
import { computeCycleTreeMove } from "./cycle-tree-move";
import {
  dayBefore,
  isCycleEffectiveOnDate,
  latestDraftsByStableKey,
  minimumPublishEffectiveFrom,
  nextOperationalDayKey,
} from "./cycle-lifecycle";
import { buildEvsDefaultCyclePlans } from "./defaults";
import { dietaryStarterPlansToCreate } from "./dietary-starter";
import type { PublishedCycleOverlapCandidate } from "./validate-cycle";
import { roomTypeIdentity } from "@/lib/facility-builder/space-type-presets";

import {
  isStandardRoomTypeKey,
  isValidConfiguredTime,
  normalizeConfiguredTime,
  shouldShowServiceStartTimes,
  validateCycleScopeAgainstCatalog,
  type CycleScopeLocationOption,
} from "./cycle-scope";
import { validateCycle, validateCycleForPublish } from "./validate-cycle";
import {
  formatReviewPublishBlockerSummary,
  validateDraftsForReviewPublish,
} from "./review-publish-validation";
import { mapCycleRow } from "./load-published-cycles";
import { loadDepartmentOperationalTypeOptions } from "./load-operational-type-targets";
import type { CycleDraftInput, KeyTimeGroupDefinition } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

async function loadHierarchyPeers(
  client: DbClient,
  departmentId: string,
): Promise<
  Array<{
    stableKey: string;
    label: string;
    parentStableKey: string | null;
    nodeKind: "PERIOD" | "KEY_TIME";
  }>
> {
  const rows = await client.departmentOperationalCycle.findMany({
    where: { departmentId },
    select: {
      stableKey: true,
      label: true,
      parentStableKey: true,
      nodeKind: true,
      version: true,
      status: true,
    },
    orderBy: [{ version: "desc" }],
  });
  // Latest version per stableKey for hierarchy validation / parent options.
  const byKey = new Map<
    string,
    { stableKey: string; label: string; parentStableKey: string | null; nodeKind: "PERIOD" | "KEY_TIME" }
  >();
  for (const row of rows) {
    if (!byKey.has(row.stableKey)) {
      byKey.set(row.stableKey, {
        stableKey: row.stableKey,
        label: row.label,
        parentStableKey: row.parentStableKey,
        nodeKind: row.nodeKind,
      });
    }
  }
  return [...byKey.values()];
}

async function resolveParentStableKey(
  client: DbClient,
  input: {
    departmentId: string;
    stableKey: string;
    parentStableKey: string | null | undefined;
    nodeKind: "PERIOD" | "KEY_TIME";
  },
): Promise<string | null> {
  const parent = input.parentStableKey?.trim() || null;
  if (input.nodeKind === "KEY_TIME" && !parent) {
    throw new Error(
      "A Key Time must belong to an Operational Cycle such as Lunch or Breakfast.",
    );
  }

  const peers = await loadHierarchyPeers(client, input.departmentId);
  if (parent) {
    const parentRow = peers.find((p) => p.stableKey === parent);
    if (parentRow?.nodeKind === "KEY_TIME") {
      throw new Error("Key Time nodes cannot contain child cycles.");
    }
  }

  const decision = wouldCreateHierarchyCycle({
    stableKey: input.stableKey,
    parentStableKey: parent,
    rows: peers.some((p) => p.stableKey === input.stableKey)
      ? peers
      : [...peers, { stableKey: input.stableKey, label: input.stableKey, parentStableKey: null }],
  });
  if (!decision.ok) {
    throw new Error(decision.reason);
  }
  return parent;
}

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function explicitLocationCreates(input: {
  nodeKind: "PERIOD" | "KEY_TIME";
  locationMode: CycleDraftInput["locationMode"];
  locationInheritFromParent?: boolean;
  unitIds?: string[];
  spaceIds?: string[];
}) {
  if (input.nodeKind === "KEY_TIME") return [];
  if (input.locationInheritFromParent) return [];
  if (input.locationMode !== "EXPLICIT_UNITS") return [];
  const rows: Array<{ id: string; unitId?: string; spaceId?: string }> = [];
  for (const unitId of input.unitIds ?? []) {
    if (unitId) rows.push({ id: cuidLike(), unitId });
  }
  for (const spaceId of input.spaceIds ?? []) {
    if (spaceId) rows.push({ id: cuidLike(), spaceId });
  }
  return rows;
}

function keyTimeGroupCreates(cycleId: string, groups: KeyTimeGroupDefinition[] | undefined) {
  if (!groups?.length) return [];
  return groups.map((group, index) => ({
    id: cuidLike(),
    dueLocal: group.dueLocal.trim(),
    displaySequence: (index + 1) * 10,
    rooms: {
      create: (group.spaceIds ?? [])
        .filter(Boolean)
        .map((spaceId) => ({
          id: cuidLike(),
          cycleId,
          spaceId,
        })),
    },
  }));
}

function resolvedNodeKind(draft: CycleDraftInput): "PERIOD" | "KEY_TIME" {
  return draft.nodeKind ?? "PERIOD";
}

function resolvedLocationInherit(
  draft: Pick<CycleDraftInput, "locationInheritFromParent" | "parentStableKey">,
  nodeKind: "PERIOD" | "KEY_TIME",
): boolean {
  if (nodeKind !== "PERIOD") return false;
  // Top-level cycles cannot inherit — clearing parent must clear inherit.
  if (!draft.parentStableKey?.trim()) return false;
  return draft.locationInheritFromParent === true;
}

function resolvedLocationMode(
  draft: CycleDraftInput,
  nodeKind: "PERIOD" | "KEY_TIME",
  inherit: boolean,
): NonNullable<CycleDraftInput["locationMode"]> {
  if (nodeKind === "KEY_TIME") return "EXPLICIT_UNITS";
  if (inherit) return "EXPLICIT_UNITS";
  return draft.locationMode ?? "ALL_DEPARTMENT_UNITS";
}

function milestoneTimeCreates(input: CycleDraftInput) {
  if (
    !shouldShowServiceStartTimes({
      cycleType: input.cycleType,
      mealType: input.mealType ?? null,
      expectedMilestones: input.expectedMilestones ?? [],
    })
  ) {
    return [];
  }
  const seen = new Set<string>();
  const rows: Array<{
    id: string;
    unitId: string;
    milestone: "SERVICE_STARTED";
    configuredTime: string;
  }> = [];
  for (const row of input.milestoneTimes ?? []) {
    if (row.milestone !== "SERVICE_STARTED") continue;
    const time = normalizeConfiguredTime(row.configuredTime);
    if (!row.unitId || !time || !isValidConfiguredTime(time)) continue;
    if (seen.has(row.unitId)) continue;
    seen.add(row.unitId);
    rows.push({
      id: cuidLike(),
      unitId: row.unitId,
      milestone: "SERVICE_STARTED",
      configuredTime: time,
    });
  }
  return rows;
}

function resolvedRoomTypeKey(
  locationMode: CycleDraftInput["locationMode"],
  roomTypeKey: string | null | undefined,
): string | null {
  if (locationMode !== "ROOM_TYPE") return null;
  const key = roomTypeKey?.trim() ?? "";
  return isStandardRoomTypeKey(key) ? key : null;
}

function resolvedOperationalTypeKeys(
  locationMode: CycleDraftInput["locationMode"],
  keys: readonly string[] | undefined,
): string[] {
  if (locationMode !== "OPERATIONAL_TYPES") return [];
  return [...new Set((keys ?? []).map((key) => key.trim()).filter(Boolean))];
}

export async function loadScopeLocations(
  client: DbClient,
  facilityId: string,
  departmentId: string,
): Promise<CycleScopeLocationOption[]> {
  const [unitRows, spaceRows] = await Promise.all([
    client.unitDepartmentResponsibility.findMany({
      where: { departmentId, unit: { facilityId } },
      select: {
        unit: {
          select: {
            id: true,
            name: true,
            hierarchyRole: true,
            parentUnitId: true,
          },
        },
      },
    }),
    client.unitSpaceResponsibility.findMany({
      where: { departmentId, space: { facilityId } },
      select: {
        space: {
          select: {
            id: true,
            name: true,
            spaceType: true,
            customTypeLabel: true,
            facilityRoomTypeId: true,
            facilityRoomType: { select: { id: true, displayName: true } },
            unitId: true,
            unit: {
              select: {
                id: true,
                name: true,
                hierarchyRole: true,
                parentUnitId: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const locations: CycleScopeLocationOption[] = [];
  for (const row of unitRows) {
    const unit = row.unit;
    if (!unit) continue;
    if (unit.hierarchyRole === "FLOOR" || unit.hierarchyRole === "BUILDING") continue;
    locations.push({
      id: unit.id,
      kind: "neighborhood",
      name: unit.name,
      hierarchyRole: unit.hierarchyRole,
    });
  }
  for (const row of spaceRows) {
    const space = row.space;
    if (!space) continue;
    const identity = roomTypeIdentity({
      spaceType: space.spaceType,
      customTypeLabel: space.customTypeLabel,
    });
    const parent = space.unit;
    const neighborhood =
      parent?.hierarchyRole === "FLOOR" || !parent
        ? { id: null as string | null, name: null as string | null }
        : { id: parent.id, name: parent.name };
    locations.push({
      id: space.id,
      kind: "room",
      name: space.name,
      roomTypeKey: identity.key,
      roomTypeLabel: space.facilityRoomType?.displayName ?? identity.label,
      facilityRoomTypeId: space.facilityRoomTypeId ?? space.facilityRoomType?.id ?? null,
      neighborhoodId: neighborhood.id,
      neighborhoodName: neighborhood.name,
      hierarchyRole: parent?.hierarchyRole ?? null,
    });
  }
  return locations;
}

async function assertDraftScope(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    draft: CycleDraftInput;
    locationMode: NonNullable<CycleDraftInput["locationMode"]>;
  },
) {
  const [locations, operationalTypes] = await Promise.all([
    loadScopeLocations(client, input.facilityId, input.departmentId),
    loadDepartmentOperationalTypeOptions({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      perspective: "working",
    }),
  ]);
  const errors = validateCycleScopeAgainstCatalog({
    locationMode: input.locationMode,
    roomTypeKey: input.draft.roomTypeKey,
    applicableOperationalTypeKeys: input.draft.applicableOperationalTypeKeys,
    allowedOperationalTypeKeys: operationalTypes.map((type) => type.key),
    unitIds: input.draft.unitIds,
    spaceIds: input.draft.spaceIds,
    milestoneTimes: input.draft.milestoneTimes,
    cycleType: input.draft.cycleType,
    mealType: input.draft.mealType,
    expectedMilestones: input.draft.expectedMilestones,
    locations,
  });
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}

export type CycleActor = {
  userId: string | null;
  label?: string | null;
};

async function appendCycleEvent(
  client: DbClient,
  input: {
    cycleId: string;
    facilityId: string;
    departmentId: string;
    eventType: string;
    actor: CycleActor;
    detailJson?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await client.departmentOperationalCycleEvent.create({
    data: {
      id: cuidLike(),
      cycleId: input.cycleId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      eventType: input.eventType,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label ?? null,
      detailJson: input.detailJson ?? undefined,
    },
  });
}

async function assertManage(
  session: AppJwtPayload,
  facilityId: string,
  departmentId: string,
) {
  const authority = await resolveCycleAuthority(session, facilityId, departmentId);
  requireCycleManage(authority);
  return authority;
}

async function nextVersionForStableKey(
  client: DbClient,
  departmentId: string,
  stableKey: string,
): Promise<number> {
  const latest = await client.departmentOperationalCycle.findFirst({
    where: { departmentId, stableKey },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

async function loadPublishedOverlapPeers(
  client: DbClient,
  facilityId: string,
  departmentId: string,
  options?: {
    excludeCycleId?: string;
    /** Peers with this stableKey are superseded on publish — exclude from overlap. */
    excludeStableKey?: string;
  },
): Promise<PublishedCycleOverlapCandidate[]> {
  const rows = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId,
      departmentId,
      status: "PUBLISHED",
      ...(options?.excludeCycleId ? { id: { not: options.excludeCycleId } } : {}),
      ...(options?.excludeStableKey
        ? { stableKey: { not: options.excludeStableKey } }
        : {}),
    },
    include: { locations: { select: { unitId: true, spaceId: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    nodeKind: r.nodeKind,
    startLocal: r.startLocal,
    endLocal: r.endLocal,
    overnight: r.overnight,
    applicableDaysOfWeek: r.applicableDaysOfWeek,
    locationMode: r.locationMode,
    applicableUnitTypes: r.applicableUnitTypes,
    unitIds: r.locations.map((l) => l.unitId).filter((id): id is string => Boolean(id)),
    effectiveFrom: toServiceDateKey(r.effectiveFrom),
    effectiveTo: r.effectiveTo ? toServiceDateKey(r.effectiveTo) : null,
    stableKey: r.stableKey,
  }));
}

export async function createDraft(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    draft: CycleDraftInput;
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const nodeKind = resolvedNodeKind(input.draft);
  const locationInherit = resolvedLocationInherit(input.draft, nodeKind);
  const locationMode = resolvedLocationMode(input.draft, nodeKind, locationInherit);
  const validation = validateCycle({
    label: input.draft.label,
    cycleType: input.draft.cycleType,
    nodeKind,
    parentStableKey: input.draft.parentStableKey,
    startLocal: nodeKind === "KEY_TIME" ? null : input.draft.startLocal,
    endLocal: nodeKind === "KEY_TIME" ? null : input.draft.endLocal,
    overnight: input.draft.overnight,
    applicableDaysOfWeek: input.draft.applicableDaysOfWeek,
    effectiveFrom: input.draft.effectiveFrom,
    mealType: input.draft.mealType,
    locationMode,
    locationInheritFromParent: locationInherit,
    applicableUnitTypes: input.draft.applicableUnitTypes,
    applicableOperationalTypeKeys: input.draft.applicableOperationalTypeKeys,
    unitIds: input.draft.unitIds,
    spaceIds: input.draft.spaceIds,
    keyTimeGroups: input.draft.keyTimeGroups,
    roomTypeKey: input.draft.roomTypeKey,
    expectedMilestones: input.draft.expectedMilestones,
  });
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join(" "));
  }
  await assertDraftScope(client, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    draft: input.draft,
    locationMode,
  });

  const stableKey = input.draft.stableKey?.trim() || `cycle_${cuidLike()}`;
  const version = await nextVersionForStableKey(client, input.departmentId, stableKey);
  const parentStableKey = await resolveParentStableKey(client, {
    departmentId: input.departmentId,
    stableKey,
    parentStableKey: input.draft.parentStableKey,
    nodeKind,
  });
  const createdId = cuidLike();
  const locationRows = explicitLocationCreates({
    nodeKind,
    locationMode,
    locationInheritFromParent: locationInherit,
    unitIds: input.draft.unitIds,
    spaceIds: input.draft.spaceIds,
  });
  const timeRows = milestoneTimeCreates(input.draft);
  const groupRows = keyTimeGroupCreates(createdId, input.draft.keyTimeGroups);

  const created = await client.departmentOperationalCycle.create({
    data: {
      id: createdId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      stableKey,
      parentStableKey,
      nodeKind,
      version,
      label: input.draft.label.trim(),
      description: input.draft.description?.trim() || null,
      cycleType: input.draft.cycleType,
      displaySequence: input.draft.displaySequence ?? 100,
      startLocal: nodeKind === "KEY_TIME" ? null : input.draft.startLocal?.trim() ?? null,
      endLocal: nodeKind === "KEY_TIME" ? null : input.draft.endLocal?.trim() ?? null,
      overnight: input.draft.overnight ?? false,
      applicableDaysOfWeek: input.draft.applicableDaysOfWeek,
      effectiveFrom: facilityLocalDateToServiceDate(input.draft.effectiveFrom),
      effectiveTo: input.draft.effectiveTo
        ? facilityLocalDateToServiceDate(input.draft.effectiveTo)
        : null,
      mealType: input.draft.mealType ?? null,
      locationMode,
      locationInheritFromParent: locationInherit,
      applicableUnitTypes:
        locationMode === "UNIT_TYPES" ? (input.draft.applicableUnitTypes ?? []) : [],
      applicableOperationalTypeKeys: resolvedOperationalTypeKeys(
        locationMode,
        input.draft.applicableOperationalTypeKeys,
      ),
      roomTypeKey: resolvedRoomTypeKey(locationMode, input.draft.roomTypeKey),
      expectedMilestones:
        input.draft.cycleType === "SERVICE" ? (input.draft.expectedMilestones ?? []) : [],
      status: "DRAFT",
      createdByUserId: input.actor.userId,
      lastChangedByUserId: input.actor.userId,
      locations: locationRows.length ? { create: locationRows } : undefined,
      milestoneTimes: timeRows.length ? { create: timeRows } : undefined,
      keyTimeGroups: groupRows.length ? { create: groupRows } : undefined,
    },
  });

  await appendCycleEvent(client, {
    cycleId: created.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "CREATED_DRAFT",
    actor: input.actor,
    detailJson: { stableKey, version },
  });

  return created;
}

export async function updateDraft(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    cycleId: string;
    draft: CycleDraftInput;
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const existing = await client.departmentOperationalCycle.findFirst({
    where: {
      id: input.cycleId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
  });
  if (!existing) throw new Error("Cycle not found.");
  if (existing.status !== "DRAFT") {
    throw new Error("Only draft cycles can be updated. Duplicate to create a new draft version.");
  }

  const nodeKind = resolvedNodeKind(input.draft);
  const submittedParent =
    input.draft.parentStableKey === undefined
      ? existing.parentStableKey
      : input.draft.parentStableKey;
  const parentCandidate =
    nodeKind === "KEY_TIME" && !submittedParent
      ? existing.parentStableKey
      : submittedParent;
  const locationInherit = resolvedLocationInherit(
    { ...input.draft, parentStableKey: parentCandidate },
    nodeKind,
  );
  const locationMode = resolvedLocationMode(input.draft, nodeKind, locationInherit);
  const validation = validateCycle({
    label: input.draft.label,
    cycleType: input.draft.cycleType,
    nodeKind,
    parentStableKey: parentCandidate,
    startLocal: nodeKind === "KEY_TIME" ? null : input.draft.startLocal,
    endLocal: nodeKind === "KEY_TIME" ? null : input.draft.endLocal,
    overnight: input.draft.overnight,
    applicableDaysOfWeek: input.draft.applicableDaysOfWeek,
    effectiveFrom: input.draft.effectiveFrom,
    mealType: input.draft.mealType,
    locationMode,
    locationInheritFromParent: locationInherit,
    applicableUnitTypes: input.draft.applicableUnitTypes,
    applicableOperationalTypeKeys: input.draft.applicableOperationalTypeKeys,
    unitIds: input.draft.unitIds,
    spaceIds: input.draft.spaceIds,
    keyTimeGroups: input.draft.keyTimeGroups,
    roomTypeKey: input.draft.roomTypeKey,
    expectedMilestones: input.draft.expectedMilestones,
  });
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join(" "));
  }
  await assertDraftScope(client, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    draft: input.draft,
    locationMode,
  });

  const parentStableKey = await resolveParentStableKey(client, {
    departmentId: input.departmentId,
    stableKey: existing.stableKey,
    parentStableKey:
      input.draft.parentStableKey === undefined
        ? existing.parentStableKey
        : input.draft.parentStableKey,
    nodeKind,
  });

  const locationRows = explicitLocationCreates({
    nodeKind,
    locationMode,
    locationInheritFromParent: locationInherit,
    unitIds: input.draft.unitIds,
    spaceIds: input.draft.spaceIds,
  });
  const timeRows = milestoneTimeCreates(input.draft);
  const groupRows = keyTimeGroupCreates(existing.id, input.draft.keyTimeGroups);

  await client.departmentOperationalCycleLocation.deleteMany({ where: { cycleId: existing.id } });
  await client.departmentOperationalCycleMilestoneTime.deleteMany({
    where: { cycleId: existing.id },
  });
  await client.departmentOperationalCycleKeyTimeGroup.deleteMany({
    where: { cycleId: existing.id },
  });

  const updated = await client.departmentOperationalCycle.update({
    where: { id: existing.id },
    data: {
      label: input.draft.label.trim(),
      description: input.draft.description?.trim() || null,
      cycleType: input.draft.cycleType,
      nodeKind,
      parentStableKey,
      displaySequence: input.draft.displaySequence ?? existing.displaySequence,
      startLocal: nodeKind === "KEY_TIME" ? null : input.draft.startLocal?.trim() ?? null,
      endLocal: nodeKind === "KEY_TIME" ? null : input.draft.endLocal?.trim() ?? null,
      overnight: input.draft.overnight ?? false,
      applicableDaysOfWeek: input.draft.applicableDaysOfWeek,
      effectiveFrom: facilityLocalDateToServiceDate(input.draft.effectiveFrom),
      effectiveTo: input.draft.effectiveTo
        ? facilityLocalDateToServiceDate(input.draft.effectiveTo)
        : null,
      mealType: input.draft.mealType ?? null,
      locationMode,
      locationInheritFromParent: locationInherit,
      applicableUnitTypes:
        locationMode === "UNIT_TYPES" ? (input.draft.applicableUnitTypes ?? []) : [],
      applicableOperationalTypeKeys: resolvedOperationalTypeKeys(
        locationMode,
        input.draft.applicableOperationalTypeKeys,
      ),
      roomTypeKey: resolvedRoomTypeKey(locationMode, input.draft.roomTypeKey),
      expectedMilestones:
        input.draft.cycleType === "SERVICE" ? (input.draft.expectedMilestones ?? []) : [],
      lastChangedByUserId: input.actor.userId,
      locations: locationRows.length ? { create: locationRows } : undefined,
      milestoneTimes: timeRows.length ? { create: timeRows } : undefined,
      keyTimeGroups: groupRows.length ? { create: groupRows } : undefined,
    },
  });

  await appendCycleEvent(client, {
    cycleId: updated.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "UPDATED_DRAFT",
    actor: input.actor,
  });

  return updated;
}

/**
 * Duplicate a cycle (published or draft) into a new draft version of the same stableKey.
 * Published windows are immutable — change via duplicate + publish.
 */
export async function duplicateCycle(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    cycleId: string;
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const source = await client.departmentOperationalCycle.findFirst({
    where: {
      id: input.cycleId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: {
      locations: true,
      milestoneTimes: true,
      keyTimeGroups: { include: { rooms: true }, orderBy: { displaySequence: "asc" } },
    },
  });
  if (!source) throw new Error("Cycle not found.");

  const version = await nextVersionForStableKey(client, input.departmentId, source.stableKey);
  const createdId = cuidLike();

  const created = await client.departmentOperationalCycle.create({
    data: {
      id: createdId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      stableKey: source.stableKey,
      parentStableKey: source.parentStableKey,
      nodeKind: source.nodeKind,
      version,
      label: source.label,
      description: source.description,
      cycleType: source.cycleType,
      displaySequence: source.displaySequence,
      startLocal: source.startLocal,
      endLocal: source.endLocal,
      overnight: source.overnight,
      applicableDaysOfWeek: source.applicableDaysOfWeek,
      effectiveFrom: source.effectiveFrom,
      effectiveTo: source.effectiveTo,
      mealType: source.mealType,
      locationMode: source.locationMode,
      locationInheritFromParent: source.locationInheritFromParent,
      applicableUnitTypes: source.applicableUnitTypes,
      applicableOperationalTypeKeys: source.applicableOperationalTypeKeys,
      roomTypeKey: source.roomTypeKey,
      expectedMilestones: source.expectedMilestones,
      status: "DRAFT",
      createdByUserId: input.actor.userId,
      lastChangedByUserId: input.actor.userId,
      locations:
        source.locations.length > 0
          ? {
              create: source.locations.map((l) => ({
                id: cuidLike(),
                unitId: l.unitId,
                spaceId: l.spaceId,
              })),
            }
          : undefined,
      milestoneTimes:
        source.milestoneTimes.length > 0
          ? {
              create: source.milestoneTimes.map((row) => ({
                id: cuidLike(),
                unitId: row.unitId,
                milestone: row.milestone,
                configuredTime: row.configuredTime,
              })),
            }
          : undefined,
      keyTimeGroups:
        source.keyTimeGroups.length > 0
          ? {
              create: source.keyTimeGroups.map((group, index) => ({
                id: cuidLike(),
                dueLocal: group.dueLocal,
                displaySequence: group.displaySequence ?? (index + 1) * 10,
                rooms: {
                  create: group.rooms.map((room) => ({
                    id: cuidLike(),
                    cycleId: createdId,
                    spaceId: room.spaceId,
                  })),
                },
              })),
            }
          : undefined,
    },
  });

  await appendCycleEvent(client, {
    cycleId: created.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "DUPLICATED_DRAFT",
    actor: input.actor,
    detailJson: { sourceCycleId: source.id, version },
  });

  return created;
}

export async function reorderDrafts(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    orderedCycleIds: string[];
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const drafts = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: "DRAFT",
      id: { in: input.orderedCycleIds },
    },
    select: { id: true },
  });
  const found = new Set(drafts.map((d) => d.id));
  for (const id of input.orderedCycleIds) {
    if (!found.has(id)) {
      throw new Error("Reorder only applies to draft cycles in this department.");
    }
  }

  let sequence = 10;
  for (const id of input.orderedCycleIds) {
    await client.departmentOperationalCycle.update({
      where: { id },
      data: {
        displaySequence: sequence,
        lastChangedByUserId: input.actor.userId,
      },
    });
    sequence += 10;
  }

  if (input.orderedCycleIds[0]) {
    await appendCycleEvent(client, {
      cycleId: input.orderedCycleIds[0],
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      eventType: "REORDERED_DRAFTS",
      actor: input.actor,
      detailJson: { orderedCycleIds: input.orderedCycleIds },
    });
  }
}

/**
 * Apply a drag move on draft cycles: sibling reorder and/or reparent.
 * Published rows are never mutated — callers must pass draft ids only.
 */
export async function applyDraftTreeMove(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    activeId: string;
    overId: string;
    placement: "before" | "after" | "inside";
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const drafts = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: "DRAFT",
    },
    select: {
      id: true,
      stableKey: true,
      label: true,
      parentStableKey: true,
      nodeKind: true,
      displaySequence: true,
    },
  });

  const result = computeCycleTreeMove({
    rows: drafts,
    activeId: input.activeId,
    overId: input.overId,
    placement: input.placement,
  });
  if (!result.ok) {
    throw new Error(result.reason);
  }

  for (const update of result.updates) {
    await client.departmentOperationalCycle.update({
      where: { id: update.id },
      data: {
        parentStableKey: update.parentStableKey,
        displaySequence: update.displaySequence,
        lastChangedByUserId: input.actor.userId,
      },
    });
  }

  await appendCycleEvent(client, {
    cycleId: input.activeId,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "REORDERED_DRAFTS",
    actor: input.actor,
    detailJson: {
      kind: "tree_move",
      placement: input.placement,
      overId: input.overId,
      summary: result.summary,
      updates: result.updates,
    },
  });

  return result;
}

export async function publishCycle(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    cycleId: string;
    actor: CycleActor;
    /**
     * When true, allow effectiveFrom = today even if a current config already exists.
     * Explicit opt-in for emergency / same-day activation. Default remains next-day-safe.
     */
    allowImmediate?: boolean;
    client?: DbClient;
    /** Preloaded groups from Review/schedule so publish cannot miss Key Time rooms. */
    keyTimeGroups?: KeyTimeGroupDefinition[];
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveCycleAuthority(session, input.facilityId, input.departmentId);
  requireCyclePublish(authority);

  const existing = await client.departmentOperationalCycle.findFirst({
    where: {
      id: input.cycleId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: {
      locations: true,
      milestoneTimes: true,
    },
  });
  if (!existing) throw new Error("Cycle not found.");
  if (existing.status !== "DRAFT") {
    throw new Error("Only draft cycles can be published.");
  }

  // Dedicated query — do not rely on a nested include on the cycle row.
  const keyTimeGroupRows = await client.departmentOperationalCycleKeyTimeGroup.findMany({
    where: { cycleId: existing.id },
    include: { rooms: true },
    orderBy: { displaySequence: "asc" },
  });
  const mapped = mapCycleRow({ ...existing, keyTimeGroups: keyTimeGroupRows });

  const timezone = await loadFacilityTimezone(client as PrismaClient, input.facilityId);
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, new Date()));
  const effectiveFromKey = toServiceDateKey(existing.effectiveFrom);

  const currentPublished = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: "PUBLISHED",
      id: { not: existing.id },
    },
  });
  const hasCurrentEffectiveConfig = currentPublished.some((row) =>
    isCycleEffectiveOnDate(row, todayKey),
  );
  const minEffective = input.allowImmediate
    ? todayKey
    : minimumPublishEffectiveFrom({
        todayKey,
        hasCurrentEffectiveConfig,
      });
  if (effectiveFromKey < minEffective) {
    throw new Error(
      hasCurrentEffectiveConfig && !input.allowImmediate
        ? `Scheduled changes must take effect on or after the next operational day (${minEffective}). Today's configuration stays in effect until then.`
        : `Effective date must be on or after ${minEffective} (facility operational day).`,
    );
  }

  const peers = await loadPublishedOverlapPeers(
    client,
    input.facilityId,
    input.departmentId,
    { excludeCycleId: existing.id, excludeStableKey: existing.stableKey },
  );

  const validation = validateCycleForPublish(
    {
      label: mapped.label,
      cycleType: mapped.cycleType,
      nodeKind: mapped.nodeKind,
      parentStableKey: mapped.parentStableKey,
      startLocal: mapped.startLocal,
      endLocal: mapped.endLocal,
      overnight: mapped.overnight,
      applicableDaysOfWeek: mapped.applicableDaysOfWeek,
      effectiveFrom: effectiveFromKey,
      effectiveTo: existing.effectiveTo ? toServiceDateKey(existing.effectiveTo) : null,
      stableKey: mapped.stableKey,
      mealType: mapped.mealType,
      locationMode: mapped.locationMode,
      locationInheritFromParent: mapped.locationInheritFromParent,
      applicableUnitTypes: mapped.applicableUnitTypes,
      applicableOperationalTypeKeys: mapped.applicableOperationalTypeKeys,
      unitIds: mapped.unitIds,
      spaceIds: mapped.spaceIds,
      roomTypeKey: mapped.roomTypeKey,
      expectedMilestones: mapped.expectedMilestones,
      keyTimeGroups:
        input.keyTimeGroups && input.keyTimeGroups.length > 0
          ? input.keyTimeGroups
          : mapped.keyTimeGroups,
    },
    peers,
    timezone,
  );
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join(" "));
  }

  // Retire prior published versions of the same stableKey prospectively.
  const priorPublished = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      stableKey: existing.stableKey,
      status: "PUBLISHED",
      id: { not: existing.id },
    },
  });

  for (const prior of priorPublished) {
    const retireTo = dayBefore(effectiveFromKey);
    await client.departmentOperationalCycle.update({
      where: { id: prior.id },
      data: {
        status: "RETIRED",
        effectiveTo: facilityLocalDateToServiceDate(retireTo),
        retiredAt: new Date(),
        lastChangedByUserId: input.actor.userId,
      },
    });
    await appendCycleEvent(client, {
      cycleId: prior.id,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      eventType: "RETIRED_ON_SUPERSEDE",
      actor: input.actor,
      detailJson: { supersededBy: existing.id, effectiveTo: retireTo },
    });
  }

  const published = await client.departmentOperationalCycle.update({
    where: { id: existing.id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedByUserId: input.actor.userId,
      lastChangedByUserId: input.actor.userId,
    },
  });

  await appendCycleEvent(client, {
    cycleId: published.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "PUBLISHED",
    actor: input.actor,
    detailJson: {
      effectiveFrom: effectiveFromKey,
      activation:
        effectiveFromKey > todayKey
          ? "scheduled"
          : input.allowImmediate && hasCurrentEffectiveConfig
            ? "immediate"
            : "immediate_first_setup",
    },
  });

  return published;
}

/** Destructive delete is allowed only for unpublished drafts. */
export function canDestructivelyDeleteCycle(
  status: "DRAFT" | "PUBLISHED" | "RETIRED",
): boolean {
  return status === "DRAFT";
}

type DraftCycleNode = {
  id: string;
  label: string;
  stableKey: string;
  parentStableKey: string | null;
};

/**
 * Depth-first post-order ids under a draft root (children before parent).
 * Only DRAFT rows; never touches published/history.
 */
export function orderDraftSubtreeForDelete(
  root: DraftCycleNode,
  allDrafts: readonly DraftCycleNode[],
): string[] {
  const byParent = new Map<string | null, DraftCycleNode[]>();
  for (const row of allDrafts) {
    const list = byParent.get(row.parentStableKey) ?? [];
    list.push(row);
    byParent.set(row.parentStableKey, list);
  }
  const ordered: string[] = [];
  const seen = new Set<string>();
  function walk(stableKey: string) {
    const children = byParent.get(stableKey) ?? [];
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      walk(child.stableKey);
      ordered.push(child.id);
    }
  }
  walk(root.stableKey);
  if (!seen.has(root.id)) ordered.push(root.id);
  return ordered;
}

/**
 * Delete an unpublished draft and its draft-only descendants.
 * Does not affect published/current/history rows, including other versions
 * of the same stableKey.
 */
export async function deleteDraft(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    cycleId: string;
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const existing = await client.departmentOperationalCycle.findFirst({
    where: {
      id: input.cycleId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    select: { id: true, label: true, status: true, stableKey: true, parentStableKey: true },
  });
  if (!existing) throw new Error("Cycle not found.");
  void input.actor;
  if (!canDestructivelyDeleteCycle(existing.status)) {
    throw new Error("Only unpublished drafts can be deleted. Retire published cycles instead.");
  }

  const allDrafts = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: "DRAFT",
    },
    select: { id: true, label: true, stableKey: true, parentStableKey: true },
  });

  const deleteOrder = orderDraftSubtreeForDelete(existing, allDrafts);

  for (const id of deleteOrder) {
    await client.departmentOperationalCycle.delete({ where: { id } });
  }

  return { id: existing.id, label: existing.label, deletedCount: deleteOrder.length };
}

/**
 * Discard every unpublished draft for a Department (whole-draft abandon).
 * Leaves published Current / Scheduled / History untouched.
 */
export async function discardAllDrafts(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);
  void input.actor;

  const allDrafts = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: "DRAFT",
    },
    select: { id: true, label: true, stableKey: true, parentStableKey: true },
  });
  if (allDrafts.length === 0) {
    return { deletedCount: 0 };
  }

  const roots = allDrafts.filter(
    (row) => !row.parentStableKey || !allDrafts.some((d) => d.stableKey === row.parentStableKey),
  );
  const deleteIds: string[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    for (const id of orderDraftSubtreeForDelete(root, allDrafts)) {
      if (seen.has(id)) continue;
      seen.add(id);
      deleteIds.push(id);
    }
  }
  // Any orphan drafts not reached from roots.
  for (const row of allDrafts) {
    if (!seen.has(row.id)) deleteIds.push(row.id);
  }

  for (const id of deleteIds) {
    await client.departmentOperationalCycle.delete({ where: { id } });
  }

  return { deletedCount: deleteIds.length };
}

/**
 * Retire a published cycle prospectively from the next operational day.
 * Sets effectiveTo to today (facility-local) so today's Run remains governed
 * by this configuration; tomorrow and later no longer resolve it.
 */
export async function retireCycle(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    cycleId: string;
    actor: CycleActor;
    /** Facility-local today YYYY-MM-DD; defaults to facility service date. */
    todayKey?: string;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const existing = await client.departmentOperationalCycle.findFirst({
    where: {
      id: input.cycleId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
  });
  if (!existing) throw new Error("Cycle not found.");
  if (existing.status !== "PUBLISHED") {
    throw new Error("Only published cycles can be retired.");
  }

  const publishedChildren = await client.departmentOperationalCycle.count({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: "PUBLISHED",
      parentStableKey: existing.stableKey,
      id: { not: existing.id },
    },
  });
  if (publishedChildren > 0) {
    throw new Error(
      `Move or retire the child cycles before retiring “${existing.label}”. Hierarchy changes belong in a Draft.`,
    );
  }

  const timezone = await loadFacilityTimezone(client as PrismaClient, input.facilityId);
  const todayKey =
    input.todayKey ?? toServiceDateKey(getFacilityServiceDate(timezone, new Date()));
  // Keep today covered; stop resolving from next operational day.
  const effectiveToKey = todayKey;

  const retired = await client.departmentOperationalCycle.update({
    where: { id: existing.id },
    data: {
      status: "RETIRED",
      effectiveTo: facilityLocalDateToServiceDate(effectiveToKey),
      retiredAt: new Date(),
      lastChangedByUserId: input.actor.userId,
    },
  });

  await appendCycleEvent(client, {
    cycleId: retired.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "RETIRED",
    actor: input.actor,
    detailJson: {
      effectiveTo: effectiveToKey,
      nextOperationalDay: nextOperationalDayKey(todayKey),
    },
  });

  return retired;
}

/**
 * Schedule all department draft cycles to become effective on a chosen operational day.
 * Sets each draft's effectiveFrom, then publishes (superseding prior same-key versions).
 * Idempotent when there are no drafts left to schedule.
 */
export async function scheduleDraftPublications(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    /** YYYY-MM-DD facility operational day when the new configuration becomes effective. */
    effectiveFrom: string;
    actor: CycleActor;
    /** Explicit same-day activation when current config already exists. */
    allowImmediate?: boolean;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveCycleAuthority(session, input.facilityId, input.departmentId);
  requireCyclePublish(authority);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    throw new Error("effectiveFrom must be YYYY-MM-DD.");
  }

  const draftRows = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: "DRAFT",
    },
    include: {
      locations: { select: { unitId: true, spaceId: true } },
      milestoneTimes: { select: { unitId: true, milestone: true, configuredTime: true } },
      keyTimeGroups: {
        select: {
          id: true,
          dueLocal: true,
          rooms: { select: { spaceId: true } },
        },
        orderBy: { displaySequence: "asc" },
      },
    },
    orderBy: [{ displaySequence: "asc" }, { stableKey: "asc" }, { version: "asc" }],
  });

  if (draftRows.length === 0) {
    return { publishedIds: [] as string[], effectiveFrom: input.effectiveFrom };
  }

  const definitions = latestDraftsByStableKey(draftRows.map((row) => mapCycleRow(row)));
  // Published parents may hold Room selections that inheriting draft phases rely on.
  const publishedContextRows = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: "PUBLISHED",
    },
    include: {
      locations: { select: { unitId: true, spaceId: true } },
      milestoneTimes: { select: { unitId: true, milestone: true, configuredTime: true } },
      keyTimeGroups: {
        select: {
          id: true,
          dueLocal: true,
          rooms: { select: { spaceId: true } },
        },
        orderBy: { displaySequence: "asc" },
      },
    },
  });
  const reviewValidation = validateDraftsForReviewPublish({
    drafts: definitions,
    locationContext: publishedContextRows.map((row) => mapCycleRow(row)),
  });
  if (!reviewValidation.valid) {
    const summary = formatReviewPublishBlockerSummary(reviewValidation);
    const detail = reviewValidation.blockers
      .map((b) => `${b.displayPath}: ${b.title}`)
      .join(" ");
    throw new Error(`${summary}. ${detail}`);
  }

  const latestIds = new Set(definitions.map((row) => row.id));
  const publishedIds: string[] = [];
  for (const draft of draftRows) {
    if (!latestIds.has(draft.id)) continue;
    await client.departmentOperationalCycle.update({
      where: { id: draft.id },
      data: {
        effectiveFrom: facilityLocalDateToServiceDate(input.effectiveFrom),
        lastChangedByUserId: input.actor.userId,
      },
    });
    const mappedDraft = definitions.find((row) => row.id === draft.id);
    const published = await publishCycle(session, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      cycleId: draft.id,
      actor: input.actor,
      allowImmediate: input.allowImmediate,
      client,
      keyTimeGroups: mappedDraft?.keyTimeGroups,
    });
    publishedIds.push(published.id);
  }

  if (input.allowImmediate && publishedIds.length > 0) {
    const timezone = await loadFacilityTimezone(client as PrismaClient, input.facilityId);
    const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, new Date()));
    if (input.effectiveFrom === todayKey) {
      const { materializeKeyTimeDayExpectations } = await import(
        "./materialize-key-time-day-expectations"
      );
      await materializeKeyTimeDayExpectations(
        {
          facilityId: input.facilityId,
          departmentId: input.departmentId,
          operationalDateKey: todayKey,
          now: new Date(),
        },
        client,
      );
    }
  }

  return { publishedIds, effectiveFrom: input.effectiveFrom };
}

/**
 * Create draft defaults from the Dietary example plan for review.
 * Only when explicitly requested — never auto-applied.
 * Skips stableKeys that already exist as DRAFT or PUBLISHED (no duplicates).
 */
export async function generateDietaryDefaultsDrafts(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    effectiveFrom: string;
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const existing = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: { in: ["DRAFT", "PUBLISHED"] },
    },
    select: { stableKey: true },
  });
  const existingKeys = new Set(existing.map((row) => row.stableKey));

  // Duplicate detection is stableKey-only so renaming "Breakfast" → "Morning Meal"
  // does not recreate Breakfast, and sibling labels like "Main Kitchen Prep" can coexist.
  const ordered = dietaryStarterPlansToCreate(existingKeys);
  const created = [];
  for (const plan of ordered) {
    const row = await createDraft(session, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      actor: input.actor,
      client,
      draft: {
        stableKey: plan.stableKey,
        parentStableKey: plan.parentStableKey,
        nodeKind: plan.nodeKind,
        label: plan.label,
        description: plan.description,
        cycleType: plan.cycleType,
        displaySequence: plan.displaySequence,
        startLocal: plan.startLocal,
        endLocal: plan.endLocal,
        overnight: plan.overnight,
        applicableDaysOfWeek: plan.applicableDaysOfWeek,
        effectiveFrom: input.effectiveFrom,
        mealType: plan.mealType,
        locationMode: plan.locationMode,
        locationInheritFromParent: plan.locationInheritFromParent,
        applicableUnitTypes: plan.applicableUnitTypes,
        roomTypeKey: plan.roomTypeKey,
        expectedMilestones: plan.expectedMilestones,
      },
    });
    created.push(row);
  }
  return created;
}

/**
 * Create draft defaults from the EVS example plan for review.
 * No mealType / SERVICE meal milestones — never auto-applied.
 * Skips stableKeys that already exist as DRAFT or PUBLISHED.
 */
export async function generateEvsDefaultsDrafts(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    effectiveFrom: string;
    actor: CycleActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const existing = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: { in: ["DRAFT", "PUBLISHED"] },
    },
    select: { stableKey: true, label: true },
  });
  const existingKeys = new Set(existing.map((row) => row.stableKey));
  const existingLabels = new Set(
    existing.map((row) => row.label.trim().toLowerCase().replace(/\s+/g, " ")),
  );

  const plans = buildEvsDefaultCyclePlans().filter((plan) => {
    const labelKey = plan.label.trim().toLowerCase().replace(/\s+/g, " ");
    return !existingKeys.has(plan.stableKey) && !existingLabels.has(labelKey);
  });
  const created = [];
  for (const plan of plans) {
    const row = await createDraft(session, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      actor: input.actor,
      client,
      draft: {
        stableKey: plan.stableKey,
        parentStableKey: plan.parentStableKey,
        nodeKind: plan.nodeKind,
        label: plan.label,
        description: plan.description,
        cycleType: plan.cycleType,
        displaySequence: plan.displaySequence,
        startLocal: plan.startLocal,
        endLocal: plan.endLocal,
        overnight: plan.overnight,
        applicableDaysOfWeek: plan.applicableDaysOfWeek,
        effectiveFrom: input.effectiveFrom,
        mealType: null,
        locationMode: plan.locationMode,
        locationInheritFromParent: plan.locationInheritFromParent,
        applicableUnitTypes: plan.applicableUnitTypes,
        roomTypeKey: plan.roomTypeKey,
        expectedMilestones: [],
      },
    });
    created.push(row);
  }
  return created;
}

/**
 * Team × department cycle — link and staffing need.
 * Cycles stay department-owned. Two teams may share Breakfast.
 * Creating a second root cycle with the same name is not allowed.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { normalizeCycleLabel } from "@/lib/operational-cycles/cycle-display";

import type { DepartmentCycleOption, TeamCycleNeedGrain, TeamCycleView } from "./types";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export function rootCycleLabelConflicts(
  label: string,
  existing: readonly {
    label: string;
    parentStableKey: string | null;
    status: string;
  }[],
): boolean {
  const normalized = normalizeCycleLabel(label);
  if (!normalized) return false;
  return existing.some(
    (row) =>
      (row.status === "DRAFT" || row.status === "PUBLISHED") &&
      row.parentStableKey == null &&
      normalizeCycleLabel(row.label) === normalized,
  );
}

export async function assertUniqueRootCycleLabel(
  client: DbClient,
  input: { departmentId: string; label: string },
): Promise<void> {
  const existing = await client.departmentOperationalCycle.findMany({
    where: {
      departmentId: input.departmentId,
      parentStableKey: null,
      status: { in: ["DRAFT", "PUBLISHED"] },
    },
    select: { label: true, parentStableKey: true, status: true },
  });
  if (rootCycleLabelConflicts(input.label, existing)) {
    throw new Error(
      `${input.label.trim()} already exists in this department. Link it instead of creating a second copy.`,
    );
  }
}

function pickPreferredCycle<T extends { status: string; version: number }>(rows: T[]): T | null {
  const draft = rows
    .filter((row) => row.status === "DRAFT")
    .sort((a, b) => b.version - a.version)[0];
  if (draft) return draft;
  const published = rows
    .filter((row) => row.status === "PUBLISHED")
    .sort((a, b) => b.version - a.version)[0];
  return published ?? rows[0] ?? null;
}

export async function loadDepartmentRootCycleOptions(
  client: DbClient,
  input: { facilityId: string; departmentId: string },
): Promise<DepartmentCycleOption[]> {
  const rows = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      parentStableKey: null,
      nodeKind: "PERIOD",
      status: { in: ["DRAFT", "PUBLISHED"] },
    },
    select: {
      stableKey: true,
      label: true,
      startLocal: true,
      endLocal: true,
      status: true,
      version: true,
    },
    orderBy: [{ displaySequence: "asc" }, { label: "asc" }],
  });
  const byKey = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byKey.get(row.stableKey) ?? [];
    list.push(row);
    byKey.set(row.stableKey, list);
  }
  const options: DepartmentCycleOption[] = [];
  for (const [stableKey, versions] of byKey) {
    const preferred = pickPreferredCycle(versions);
    if (!preferred || (preferred.status !== "DRAFT" && preferred.status !== "PUBLISHED")) {
      continue;
    }
    options.push({
      stableKey,
      label: preferred.label,
      startLocal: preferred.startLocal,
      endLocal: preferred.endLocal,
      status: preferred.status,
    });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export async function loadTeamCyclesForDepartment(
  client: DbClient,
  input: { facilityId: string; departmentId: string },
): Promise<Map<string, TeamCycleView[]>> {
  const [links, cycleRows] = await Promise.all([
    client.departmentTeamCycle.findMany({
      where: { facilityId: input.facilityId, departmentId: input.departmentId },
      orderBy: { createdAt: "asc" },
    }),
    client.departmentOperationalCycle.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        status: { in: ["DRAFT", "PUBLISHED", "RETIRED"] },
      },
      select: {
        id: true,
        stableKey: true,
        parentStableKey: true,
        label: true,
        nodeKind: true,
        startLocal: true,
        endLocal: true,
        applicableDaysOfWeek: true,
        status: true,
        version: true,
        displaySequence: true,
      },
    }),
  ]);

  const byStableKey = new Map<string, typeof cycleRows>();
  for (const row of cycleRows) {
    const list = byStableKey.get(row.stableKey) ?? [];
    list.push(row);
    byStableKey.set(row.stableKey, list);
  }

  const result = new Map<string, TeamCycleView[]>();
  for (const link of links) {
    const versions = byStableKey.get(link.cycleStableKey) ?? [];
    const preferred = pickPreferredCycle(versions);
    const children = cycleRows
      .filter(
        (row) =>
          row.parentStableKey === link.cycleStableKey &&
          (row.status === "DRAFT" || row.status === "PUBLISHED"),
      )
      .sort((a, b) => a.displaySequence - b.displaySequence || a.label.localeCompare(b.label))
      .map((row) => ({
        id: row.id,
        stableKey: row.stableKey,
        label: row.label,
        nodeKind: row.nodeKind,
        startLocal: row.startLocal,
        endLocal: row.endLocal,
      }));
    const view: TeamCycleView = {
      id: link.id,
      cycleStableKey: link.cycleStableKey,
      cycleId: preferred?.id ?? null,
      label: preferred?.label ?? link.cycleStableKey,
      startLocal: preferred?.startLocal ?? null,
      endLocal: preferred?.endLocal ?? null,
      applicableDaysOfWeek: preferred?.applicableDaysOfWeek ?? [],
      status:
        preferred?.status === "DRAFT" ||
        preferred?.status === "PUBLISHED" ||
        preferred?.status === "RETIRED"
          ? preferred.status
          : "MISSING",
      requiredCount: link.requiredCount,
      grain: link.grain,
      children,
    };
    const list = result.get(link.teamId) ?? [];
    list.push(view);
    result.set(link.teamId, list);
  }
  return result;
}

export async function linkTeamToCycle(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    teamId: string;
    cycleStableKey: string;
    requiredCount?: number | null;
    grain?: TeamCycleNeedGrain;
  },
): Promise<void> {
  const team = await client.departmentTeam.findFirst({
    where: {
      id: input.teamId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!team) throw new Error("Team not found.");

  const cycle = await client.departmentOperationalCycle.findFirst({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      stableKey: input.cycleStableKey,
      parentStableKey: null,
      status: { in: ["DRAFT", "PUBLISHED"] },
    },
    select: { stableKey: true },
  });
  if (!cycle) throw new Error("Operational Cycle not found.");

  const existing = await client.departmentTeamCycle.findFirst({
    where: { teamId: input.teamId, cycleStableKey: input.cycleStableKey },
    select: { id: true },
  });
  if (existing) throw new Error("This team already runs that cycle.");

  await client.departmentTeamCycle.create({
    data: {
      teamId: input.teamId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      cycleStableKey: input.cycleStableKey,
      requiredCount: input.requiredCount ?? null,
      grain: input.grain ?? "TOTAL",
    },
  });
}

export async function unlinkTeamFromCycle(
  client: DbClient,
  input: { facilityId: string; teamId: string; linkId: string },
): Promise<void> {
  const existing = await client.departmentTeamCycle.findFirst({
    where: { id: input.linkId, teamId: input.teamId, facilityId: input.facilityId },
    select: { id: true },
  });
  if (!existing) throw new Error("Cycle link not found.");
  await client.departmentTeamCycle.delete({ where: { id: existing.id } });
}

export async function updateTeamCycleNeed(
  client: DbClient,
  input: {
    facilityId: string;
    teamId: string;
    linkId: string;
    requiredCount: number | null;
    grain: TeamCycleNeedGrain;
  },
): Promise<void> {
  const existing = await client.departmentTeamCycle.findFirst({
    where: { id: input.linkId, teamId: input.teamId, facilityId: input.facilityId },
    select: { id: true },
  });
  if (!existing) throw new Error("Cycle link not found.");
  if (input.requiredCount != null && (!Number.isInteger(input.requiredCount) || input.requiredCount < 1)) {
    throw new Error("Need must be empty or a whole number of at least 1.");
  }
  await client.departmentTeamCycle.update({
    where: { id: existing.id },
    data: {
      requiredCount: input.requiredCount,
      grain: input.grain,
    },
  });
}

/**
 * Operating Rhythm stays department-owned.
 * A Team does not run a cycle and does not store a staffing count.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { normalizeCycleLabel } from "@/lib/operational-cycles/cycle-display";

import type { DepartmentCycleOption, TeamCycleView } from "./types";

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
  _client: DbClient,
  _input: { facilityId: string; departmentId: string },
): Promise<Map<string, TeamCycleView[]>> {
  return new Map();
}

export async function linkTeamToCycle(): Promise<void> {
  throw new Error("A Team does not run a cycle. Coverage states the staffing need.");
}

export async function unlinkTeamFromCycle(): Promise<void> {
  throw new Error("A Team does not run a cycle. Coverage states the staffing need.");
}

export async function updateTeamCycleNeed(): Promise<void> {
  throw new Error("A Team does not store a coverage count.");
}

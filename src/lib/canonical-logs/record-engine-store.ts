import type { Prisma, PrismaClient } from "@prisma/client";

import { cookies } from "next/headers";

import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import type { FacilitySession } from "@/lib/auth";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { getFacilityServiceDate, loadFacilityTimezone, toServiceDateKey } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import {
  evaluateCanonicalCutoverReadiness,
  resolveRecordEngine,
  type RecordEngineMode,
  type RecordEngineRollout,
} from "./record-engine-rollout";

type Db = PrismaClient | Prisma.TransactionClient;

export async function listRecordEngineRollouts(
  client: Db,
  facilityId: string,
  departmentId: string,
): Promise<RecordEngineRollout[]> {
  const rows = await client.recordEngineRollout.findMany({
    where: { facilityId, departmentId },
    orderBy: { effectiveFromServiceDate: "asc" },
    select: { facilityId: true, departmentId: true, mode: true, effectiveFromServiceDate: true },
  });
  return rows.map((row) => ({
    facilityId: row.facilityId,
    departmentId: row.departmentId,
    mode: row.mode,
    effectiveFromServiceDate: row.effectiveFromServiceDate,
  }));
}

export async function effectiveRecordEngine(input: {
  facilityId: string;
  departmentId: string;
  serviceDate: string;
  client?: Db;
}): Promise<RecordEngineMode> {
  const client = input.client ?? prisma;
  const rollouts = await listRecordEngineRollouts(client, input.facilityId, input.departmentId);
  return resolveRecordEngine({
    capabilityEnabled: isCanonicalLogsEnabled(),
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    serviceDate: input.serviceDate,
    rollouts,
  });
}

export async function departmentUsesCanonicalRecords(input: {
  facilityId: string;
  departmentId: string | null;
  serviceDate?: string | null;
  client?: Db;
}): Promise<boolean> {
  if (!input.departmentId || !isCanonicalLogsEnabled()) return false;
  const client = input.client ?? prisma;
  const serviceDate =
    input.serviceDate ??
    toServiceDateKey(getFacilityServiceDate(await loadFacilityTimezone(client, input.facilityId)));
  return (await effectiveRecordEngine({ ...input, departmentId: input.departmentId, serviceDate, client })) === "CANONICAL";
}

export async function activeDepartmentUsesCanonicalRecords(
  session?: FacilitySession | null,
): Promise<boolean> {
  const resolved = session ?? (await (await import("@/lib/auth")).getSession());
  if (!resolved?.facilityId || !isCanonicalLogsEnabled()) return false;
  const cookieStore = await cookies();
  const nav = await resolveActiveDepartmentForShell(resolved, cookieStore);
  if (!nav.activeDepartmentId) return false;
  return departmentUsesCanonicalRecords({
    facilityId: resolved.facilityId,
    departmentId: nav.activeDepartmentId,
  });
}

export async function scheduleRecordEngineChange(input: {
  client?: Db;
  facilityId: string;
  departmentId: string;
  mode: RecordEngineMode;
  effectiveFromServiceDate: string;
  todayKey: string;
  actorUserId: string | null;
  actorLabel: string | null;
  activeAttachmentCount?: number;
  attachmentSetupErrorCount?: number;
  pmUsesOperationalTemplate?: boolean;
}) {
  const client = input.client ?? prisma;
  const department = await client.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId },
    select: { id: true },
  });
  const readiness = evaluateCanonicalCutoverReadiness({
    capabilityEnabled: isCanonicalLogsEnabled(),
    departmentExists: Boolean(department),
    effectiveFromServiceDate: input.effectiveFromServiceDate,
    todayKey: input.todayKey,
    activeAttachmentCount: input.activeAttachmentCount ?? 0,
    attachmentSetupErrorCount: input.attachmentSetupErrorCount ?? 0,
    pmUsesOperationalTemplate: input.pmUsesOperationalTemplate === true,
  });
  if (input.mode === "LEGACY") {
    const legacyBlockers = readiness.blockers.filter(
      (reason) => !reason.includes("not capable") && !reason.includes("setup error"),
    );
    if (!department) throw new Error("The department could not be resolved.");
    if (legacyBlockers.some((reason) => reason.includes("not valid") || reason.includes("already closed"))) {
      throw new Error(legacyBlockers[0]);
    }
  } else if (readiness.status === "BLOCKED") {
    throw new Error(readiness.blockers[0] ?? "Canonical Records are not ready for this department.");
  }
  const existing = await client.recordEngineRollout.findUnique({
    where: {
      facilityId_departmentId_effectiveFromServiceDate: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        effectiveFromServiceDate: input.effectiveFromServiceDate,
      },
    },
    select: { id: true, mode: true },
  });
  if (existing) {
    if (existing.mode === input.mode) return existing;
    throw new Error("That service date already has a Record engine decision. Choose another service date.");
  }
  return client.recordEngineRollout.create({
    data: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      mode: input.mode,
      effectiveFromServiceDate: input.effectiveFromServiceDate,
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel,
    },
  });
}

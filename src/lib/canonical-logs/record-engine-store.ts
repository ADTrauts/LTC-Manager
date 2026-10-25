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
  _client: Db,
  _facilityId: string,
  _departmentId: string,
): Promise<RecordEngineRollout[]> {
  return [];
}

export async function effectiveRecordEngine(input: {
  facilityId: string;
  departmentId: string;
  serviceDate: string;
  client?: Db;
}): Promise<RecordEngineMode> {
  const client = input.client ?? prisma;
  const [rollouts, department] = await Promise.all([
    listRecordEngineRollouts(client, input.facilityId, input.departmentId),
    client.department.findFirst({
      where: { id: input.departmentId, facilityId: input.facilityId },
      select: { key: true },
    }),
  ]);
  return resolveRecordEngine({
    capabilityEnabled: isCanonicalLogsEnabled(),
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    departmentKey: department?.key ?? null,
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
  if (input.mode === "LEGACY") {
    throw new Error("Previous Logs are retired. This department uses forward Records.");
  }
  return {
    id: "forward-records",
    mode: input.mode,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
  };
}

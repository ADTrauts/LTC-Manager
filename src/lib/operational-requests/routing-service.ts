/**
 * Phase 12A Department Request Route service.
 * Configures allowed requesting → responsible destinations. No rules engine.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { isPlantOperationsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

import {
  requireConfigureRoutes,
  resolvePlantOperationsAuthority,
} from "./authority";

type DbClient = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

export async function listActiveRoutesForRequestingDepartment(
  facilityId: string,
  requestingDepartmentId: string,
  client: DbClient = prisma,
) {
  return client.departmentRequestRoute.findMany({
    where: {
      facilityId,
      requestingDepartmentId,
      isActive: true,
    },
    include: {
      responsibleDepartment: { select: { id: true, name: true, key: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function listRoutesForFacility(
  session: AppJwtPayload,
  facilityId: string,
  plantDepartmentId: string,
) {
  const authority = await resolvePlantOperationsAuthority(
    session,
    facilityId,
    plantDepartmentId,
  );
  requireConfigureRoutes(authority);

  return prisma.departmentRequestRoute.findMany({
    where: { facilityId },
    include: {
      requestingDepartment: { select: { id: true, name: true, key: true } },
      responsibleDepartment: { select: { id: true, name: true, key: true } },
    },
    orderBy: [
      { requestingDepartmentId: "asc" },
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
  });
}

export async function upsertRequestRoute(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestingDepartmentId: string;
    responsibleDepartmentId: string;
    isActive?: boolean;
    sortOrder?: number;
    note?: string | null;
  },
) {
  const authority = await resolvePlantOperationsAuthority(
    session,
    input.facilityId,
    input.plantDepartmentId,
  );
  requireConfigureRoutes(authority);

  await assertSameFacilityDepartments(input.facilityId, [
    input.requestingDepartmentId,
    input.responsibleDepartmentId,
  ]);

  const responsible = await prisma.department.findFirst({
    where: { id: input.responsibleDepartmentId, facilityId: input.facilityId },
    select: { key: true },
  });
  if (responsible?.key === "PLANT" && !isPlantOperationsEnabled()) {
    throw new Error("Cannot configure Plant as a destination while Plant Operations is disabled.");
  }

  return prisma.departmentRequestRoute.upsert({
    where: {
      facilityId_requestingDepartmentId_responsibleDepartmentId: {
        facilityId: input.facilityId,
        requestingDepartmentId: input.requestingDepartmentId,
        responsibleDepartmentId: input.responsibleDepartmentId,
      },
    },
    create: {
      id: cuidLike(),
      facilityId: input.facilityId,
      requestingDepartmentId: input.requestingDepartmentId,
      responsibleDepartmentId: input.responsibleDepartmentId,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 100,
      note: input.note?.trim() || null,
    },
    update: {
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 100,
      note: input.note !== undefined ? input.note?.trim() || null : undefined,
    },
  });
}

/**
 * Validate that a requesting department may send a request to a responsible department.
 * Rejects foreign / cross-facility / inactive routes. When destination is Plant, requires flag.
 */
export async function validateRoute(input: {
  facilityId: string;
  requestingDepartmentId: string;
  responsibleDepartmentId: string;
  client?: DbClient;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = input.client ?? prisma;

  if (input.requestingDepartmentId === input.responsibleDepartmentId) {
    // Same-department self-route is allowed only when an active route exists (optional).
  }

  const depts = await client.department.findMany({
    where: {
      id: { in: [input.requestingDepartmentId, input.responsibleDepartmentId] },
      facilityId: input.facilityId,
      isActive: true,
    },
    select: { id: true, key: true },
  });
  if (depts.length !== 2 && input.requestingDepartmentId !== input.responsibleDepartmentId) {
    return { ok: false, reason: "Requesting or responsible department is not in this facility." };
  }
  if (
    input.requestingDepartmentId === input.responsibleDepartmentId &&
    depts.length !== 1
  ) {
    return { ok: false, reason: "Department is not in this facility." };
  }

  const responsible = depts.find((d) => d.id === input.responsibleDepartmentId);
  if (responsible?.key === "PLANT" && !isPlantOperationsEnabled()) {
    return {
      ok: false,
      reason: "Plant Operations is not enabled; cannot route requests to Plant.",
    };
  }

  const route = await client.departmentRequestRoute.findFirst({
    where: {
      facilityId: input.facilityId,
      requestingDepartmentId: input.requestingDepartmentId,
      responsibleDepartmentId: input.responsibleDepartmentId,
      isActive: true,
    },
    select: { id: true },
  });

  if (!route) {
    return {
      ok: false,
      reason: "No active request route allows this destination.",
    };
  }

  return { ok: true };
}

async function assertSameFacilityDepartments(
  facilityId: string,
  departmentIds: string[],
) {
  const unique = [...new Set(departmentIds)];
  const found = await prisma.department.findMany({
    where: { id: { in: unique }, facilityId, isActive: true },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    throw new Error("Department not found in this facility.");
  }
}

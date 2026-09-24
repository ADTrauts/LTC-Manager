/**
 * Coverage expectation writes.
 *
 * Published versions are not mutated in place. Edits fork a DRAFT successor.
 * Runtime continues using the previous PUBLISHED row until the draft is published
 * with an effective date.
 */

import { randomBytes } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { loadDepartmentOperationalTypeOptions } from "@/lib/operational-cycles/load-operational-type-targets";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import { getRoleDefinition, isRoleValidForDepartment } from "@/lib/scheduling/assignment-roles";

import { requireCoverageManage, resolveCoverageAuthority } from "./authority";
import { toCoverageExpectationView } from "./load-coverage";
import {
  validateCoverageCycleStableKeys,
  validateCoverageOperationalTypeKeys,
} from "./match-expectation";
import { dayBefore, resolveCoveragePublishEffectiveFromKey } from "./publication";
import type { CoverageExpectationView } from "./views";

type DbClient = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

async function requireManage(
  session: AppJwtPayload,
  facilityId: string,
  departmentId: string,
) {
  requireCoverageManage(await resolveCoverageAuthority(session, facilityId, departmentId));
}

const TEMPLATE_INCLUDE = {
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: { unit: { select: { name: true } } },
  },
} as const;

async function loadAllowedKeys(
  client: DbClient,
  input: { facilityId: string; departmentId: string },
) {
  const [operationalTypes, cycles] = await Promise.all([
    loadDepartmentOperationalTypeOptions({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      perspective: "working",
    }),
    prisma.departmentOperationalCycle.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        status: { in: ["DRAFT", "PUBLISHED"] },
        nodeKind: "PERIOD",
      },
      select: { stableKey: true },
    }),
  ]);
  return {
    operationalTypeKeys: new Set(operationalTypes.map((row) => row.key)),
    cycleKeys: new Set(cycles.map((row) => row.stableKey)),
  };
}

async function loadTemplateOrThrow(
  client: DbClient,
  input: { id: string; facilityId: string },
) {
  const row = await client.operationalAssignmentTemplate.findFirst({
    where: { id: input.id, facilityId: input.facilityId },
    include: TEMPLATE_INCLUDE,
  });
  if (!row) throw new Error("Coverage expectation not found.");
  return row;
}

export async function ensureWorkingCoverageDraft(
  client: DbClient,
  input: { templateId: string; facilityId: string },
) {
  const current = await loadTemplateOrThrow(client, {
    id: input.templateId,
    facilityId: input.facilityId,
  });
  if (current.status === "DRAFT") return current;
  if (current.status === "RETIRED") {
    throw new Error("Retired coverage expectations cannot be edited.");
  }

  const existingDraft = await client.operationalAssignmentTemplate.findFirst({
    where: {
      facilityId: current.facilityId,
      departmentId: current.departmentId,
      stableKey: current.stableKey,
      status: "DRAFT",
    },
    include: TEMPLATE_INCLUDE,
  });
  if (existingDraft) return existingDraft;

  const maxVersion = await client.operationalAssignmentTemplate.aggregate({
    where: {
      facilityId: current.facilityId,
      departmentId: current.departmentId,
      stableKey: current.stableKey,
    },
    _max: { version: true },
  });

  return client.operationalAssignmentTemplate.create({
    data: {
      facilityId: current.facilityId,
      departmentId: current.departmentId,
      stableKey: current.stableKey,
      version: (maxVersion._max.version ?? current.version) + 1,
      status: "DRAFT",
      name: current.name,
      description: current.description,
      isActive: true,
      operationDefinitionId: current.operationDefinitionId,
      workShiftId: current.workShiftId,
      createdByUserId: current.createdByUserId,
      items: {
        create: current.items.map((item) => ({
          roleKey: item.roleKey,
          roleLabel: item.roleLabel,
          unitId: item.unitId,
          applicableOperationalTypeKeys: item.applicableOperationalTypeKeys,
          applicableOperationalCycleStableKeys: item.applicableOperationalCycleStableKeys,
          startsAtLocal: item.startsAtLocal,
          endsAtLocal: item.endsAtLocal,
          requiredCount: item.requiredCount,
          sortOrder: item.sortOrder,
          notes: item.notes,
        })),
      },
    },
    include: TEMPLATE_INCLUDE,
  });
}

export async function createCoverageExpectation(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    name: string;
    description?: string | null;
  },
): Promise<CoverageExpectationView> {
  await requireManage(session, input.facilityId, input.departmentId);
  const name = input.name.trim();
  if (!name) throw new Error("Coverage expectation name is required.");

  const created = await prisma.operationalAssignmentTemplate.create({
    data: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      stableKey: `cov_${cuidLike()}`,
      version: 1,
      status: "DRAFT",
      name,
      description: input.description?.trim() || null,
      isActive: true,
      createdByUserId: sessionUserIdForFk(session),
    },
    include: TEMPLATE_INCLUDE,
  });
  return toCoverageExpectationView(created);
}

export async function updateCoverageExpectation(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    templateId: string;
    name?: string;
    description?: string | null;
  },
): Promise<CoverageExpectationView> {
  const current = await loadTemplateOrThrow(prisma, {
    id: input.templateId,
    facilityId: input.facilityId,
  });
  await requireManage(session, input.facilityId, current.departmentId);
  const draft = await ensureWorkingCoverageDraft(prisma, {
    templateId: current.id,
    facilityId: input.facilityId,
  });
  const updated = await prisma.operationalAssignmentTemplate.update({
    where: { id: draft.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
    },
    include: TEMPLATE_INCLUDE,
  });
  return toCoverageExpectationView(updated);
}

export async function upsertCoverageExpectationItem(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    templateId: string;
    itemId?: string | null;
    roleKey: string;
    requiredCount: number;
    operationalTypeKeys: readonly string[];
    cycleStableKeys: readonly string[];
  },
): Promise<CoverageExpectationView> {
  const current = await loadTemplateOrThrow(prisma, {
    id: input.templateId,
    facilityId: input.facilityId,
  });
  await requireManage(session, input.facilityId, current.departmentId);
  const department = await prisma.department.findFirst({
    where: { id: current.departmentId, facilityId: input.facilityId },
    select: { key: true },
  });
  if (!department) throw new Error("Department not found.");
  if (!isRoleValidForDepartment(input.roleKey, department.key)) {
    throw new Error(`Role "${input.roleKey}" is not valid for this department.`);
  }
  const role = getRoleDefinition(input.roleKey);
  if (!role) throw new Error("Unknown operational responsibility.");
  if (!Number.isInteger(input.requiredCount) || input.requiredCount < 1) {
    throw new Error("Required count must be an integer of at least 1.");
  }

  const allowed = await loadAllowedKeys(prisma, {
    facilityId: input.facilityId,
    departmentId: current.departmentId,
  });
  const operationalTypeKeys = validateCoverageOperationalTypeKeys({
    submittedKeys: input.operationalTypeKeys,
    allowedKeys: allowed.operationalTypeKeys,
  });
  const cycleStableKeys = validateCoverageCycleStableKeys({
    submittedKeys: input.cycleStableKeys,
    allowedKeys: allowed.cycleKeys,
  });
  if (operationalTypeKeys.length === 0) {
    throw new Error("Select at least one Operational Type.");
  }
  if (cycleStableKeys.length === 0) {
    throw new Error("Select at least one Operational Cycle.");
  }

  const draft = await ensureWorkingCoverageDraft(prisma, {
    templateId: current.id,
    facilityId: input.facilityId,
  });

  if (input.itemId) {
    const existing = draft.items.find((item) => item.id === input.itemId);
    if (!existing) {
      const source = current.items.find((item) => item.id === input.itemId);
      if (!source) throw new Error("Coverage requirement not found.");
      const match = draft.items.find(
        (item) =>
          item.roleKey === source.roleKey &&
          item.requiredCount === source.requiredCount &&
          item.sortOrder === source.sortOrder,
      );
      if (match) {
        await prisma.operationalAssignmentTemplateItem.update({
          where: { id: match.id },
          data: {
            roleKey: input.roleKey,
            roleLabel: role.label,
            requiredCount: input.requiredCount,
            applicableOperationalTypeKeys: operationalTypeKeys,
            applicableOperationalCycleStableKeys: cycleStableKeys,
            unitId: null,
          },
        });
      }
    } else {
      await prisma.operationalAssignmentTemplateItem.update({
        where: { id: existing.id },
        data: {
          roleKey: input.roleKey,
          roleLabel: role.label,
          requiredCount: input.requiredCount,
          applicableOperationalTypeKeys: operationalTypeKeys,
          applicableOperationalCycleStableKeys: cycleStableKeys,
          unitId: null,
        },
      });
    }
  } else {
    const maxSort = draft.items.reduce((max, item) => Math.max(max, item.sortOrder), 0);
    await prisma.operationalAssignmentTemplateItem.create({
      data: {
        templateId: draft.id,
        roleKey: input.roleKey,
        roleLabel: role.label,
        requiredCount: input.requiredCount,
        applicableOperationalTypeKeys: operationalTypeKeys,
        applicableOperationalCycleStableKeys: cycleStableKeys,
        sortOrder: maxSort + 10,
      },
    });
  }

  const updated = await loadTemplateOrThrow(prisma, {
    id: draft.id,
    facilityId: input.facilityId,
  });
  return toCoverageExpectationView(updated);
}

export async function removeCoverageExpectationItem(
  session: AppJwtPayload,
  input: { facilityId: string; templateId: string; itemId: string },
): Promise<CoverageExpectationView> {
  const current = await loadTemplateOrThrow(prisma, {
    id: input.templateId,
    facilityId: input.facilityId,
  });
  await requireManage(session, input.facilityId, current.departmentId);
  const draft = await ensureWorkingCoverageDraft(prisma, {
    templateId: current.id,
    facilityId: input.facilityId,
  });
  const target =
    draft.items.find((item) => item.id === input.itemId) ??
    draft.items.find((item) => {
      const source = current.items.find((row) => row.id === input.itemId);
      return (
        source &&
        item.roleKey === source.roleKey &&
        item.requiredCount === source.requiredCount &&
        item.sortOrder === source.sortOrder
      );
    });
  if (!target) throw new Error("Coverage requirement not found.");
  await prisma.operationalAssignmentTemplateItem.delete({ where: { id: target.id } });
  const updated = await loadTemplateOrThrow(prisma, {
    id: draft.id,
    facilityId: input.facilityId,
  });
  return toCoverageExpectationView(updated);
}

export async function publishCoverageExpectation(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    templateId: string;
    effectiveFrom?: string | null;
  },
): Promise<CoverageExpectationView> {
  const current = await loadTemplateOrThrow(prisma, {
    id: input.templateId,
    facilityId: input.facilityId,
  });
  await requireManage(session, input.facilityId, current.departmentId);
  if (current.status !== "DRAFT") {
    throw new Error("Only a working draft can be published.");
  }
  if (current.items.length === 0) {
    throw new Error("Add at least one coverage requirement before publishing.");
  }

  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone));
  const effectiveFromKey = resolveCoveragePublishEffectiveFromKey({
    requestedEffectiveFromKey: input.effectiveFrom,
    currentFacilityServiceDateKey: todayKey,
  });
  const effectiveFrom = facilityLocalDateToServiceDate(effectiveFromKey);

  await prisma.$transaction(async (tx) => {
    const previous = await tx.operationalAssignmentTemplate.findMany({
      where: {
        facilityId: current.facilityId,
        departmentId: current.departmentId,
        stableKey: current.stableKey,
        status: "PUBLISHED",
        id: { not: current.id },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
      },
    });
    const closeOn = facilityLocalDateToServiceDate(dayBefore(effectiveFromKey));
    for (const row of previous) {
      const alreadyEnded =
        row.effectiveTo && toServiceDateKey(row.effectiveTo) < effectiveFromKey;
      if (alreadyEnded) continue;
      await tx.operationalAssignmentTemplate.update({
        where: { id: row.id },
        data: {
          effectiveTo: closeOn,
          status:
            row.effectiveFrom && toServiceDateKey(row.effectiveFrom) > effectiveFromKey
              ? "RETIRED"
              : "PUBLISHED",
        },
      });
    }
    await tx.operationalAssignmentTemplate.update({
      where: { id: current.id },
      data: {
        status: "PUBLISHED",
        isActive: true,
        publishedAt: new Date(),
        effectiveFrom,
        effectiveTo: null,
      },
    });
  });

  const published = await loadTemplateOrThrow(prisma, {
    id: current.id,
    facilityId: input.facilityId,
  });
  return toCoverageExpectationView(published);
}

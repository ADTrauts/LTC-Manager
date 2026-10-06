/**
 * Facility Plant Operations Preventive Maintenance Build loaders.
 * Does not materialize occurrences or generate Work Orders.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { presentAssetLifecycleAndCondition } from "@/lib/asset-operations/lifecycle-presentation";
import { listMaintenanceCategories } from "@/lib/asset-operations/maintenance-categories";
import { isAssetLifecycleRetired } from "@/lib/asset-operations/ownership";
import type { AppJwtPayload } from "@/lib/auth";
import { isKnowledgeProcedureCategory } from "@/lib/knowledge/version-semantics";
import { isPlantRuntimeEnabled } from "@/lib/department-products/plant-runtime";
import { prisma } from "@/lib/prisma";

import { resolvePmPlanAuthority, type PmPlanAuthorityDecision } from "./authority";
import { type CivilDate, facilityCivilToday, parseCivilDate } from "./civil-date";
import {
  formatCadenceSummary,
  nextProjectedScheduledDate,
  pmGenerationWarning,
  presentPmPlanStatus,
  presentPmPriority,
  type PmPlanStatusPresentation,
} from "./presentation";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type PmPlanListFilter = "all" | "published" | "draft" | "retired";

export type PmBuilderAssetOption = {
  id: string;
  name: string;
  assetCode: string;
  locationLabel: string;
  status: string;
  conditionLabel: string;
  retired: boolean;
};

export type PmBuilderCategoryOption = {
  id: string;
  label: string;
  archived: boolean;
};

export type PmBuilderProcedureOption = {
  versionId: string;
  articleId: string;
  title: string;
  version: number;
};

export type PmBuilderTemplateOption = {
  id: string;
  name: string;
  purposeType: string;
  version: number;
};

export type PmBuilderEmployeeOption = {
  id: string;
  name: string;
};

export type PmPlanListRow = {
  id: string;
  name: string;
  assetName: string;
  assetCode: string;
  assetStatus: string;
  status: PmPlanStatusPresentation;
  publishedVersion: number | null;
  cadenceSummary: string;
  nextProjectedDate: CivilDate | null;
  categoryLabel: string | null;
  priorityLabel: string;
  procedureLabel: string | null;
  assigneeLabel: string | null;
  generationWarning: ReturnType<typeof pmGenerationWarning>;
};

const versionInclude = {
  maintenanceCategory: { select: { id: true, label: true, archivedAt: true } },
  procedureVersion: {
    select: {
      id: true,
      version: true,
      status: true,
      title: true,
      article: { select: { id: true, title: true, category: true } },
    },
  },
  defaultAssignedEmployee: {
    select: { id: true, firstName: true, lastName: true, status: true },
  },
  recordRequirements: { orderBy: { sortOrder: "asc" as const } },
} as const;

function employeeName(row: { firstName: string; lastName: string } | null | undefined) {
  if (!row) return null;
  return `${row.firstName} ${row.lastName}`.trim();
}

function procedureLabel(version: {
  version: number;
  title: string | null;
  article: { title: string };
} | null | undefined) {
  if (!version) return null;
  const title = version.article.title || version.title || "Procedure";
  return `${title} v${version.version}`;
}

export async function loadPmBuilderOptions(
  input: {
    facilityId: string;
    departmentId: string;
    currentAssetId?: string | null;
    currentCategoryId?: string | null;
    currentProcedureVersionId?: string | null;
  },
  client: DbClient = prisma,
) {
  const [assets, categories, procedures, templates, employees] = await Promise.all([
    client.asset.findMany({
      where: {
        unit: { facilityId: input.facilityId },
        OR: [{ departmentId: input.departmentId }, { departmentId: null }],
      },
      orderBy: [{ assetCode: "asc" }],
      select: {
        id: true,
        name: true,
        assetCode: true,
        status: true,
        unit: { select: { name: true } },
      },
    }),
    listMaintenanceCategories(input.facilityId, { includeArchived: true, client }),
    client.knowledgeArticleVersion.findMany({
      where: {
        status: "PUBLISHED",
        article: {
          facilityId: input.facilityId,
          category: "SOP",
        },
      },
      select: {
        id: true,
        version: true,
        title: true,
        article: { select: { id: true, title: true, category: true } },
      },
      orderBy: [{ article: { title: "asc" } }, { version: "desc" }],
    }),
    client.operationalTemplate.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        status: "PUBLISHED",
      },
      select: { id: true, name: true, purposeType: true, version: true },
      orderBy: [{ name: "asc" }, { version: "desc" }],
    }),
    client.employee.findMany({
      where: {
        facilityId: input.facilityId,
        status: "ACTIVE",
        OR: [
          { primaryDepartmentId: input.departmentId },
          { employeeDepartments: { some: { departmentId: input.departmentId } } },
        ],
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const assetOptions: PmBuilderAssetOption[] = assets
    .filter(
      (row) =>
        !isAssetLifecycleRetired(row.status) ||
        row.id === input.currentAssetId,
    )
    .map((row) => {
      const condition = presentAssetLifecycleAndCondition(row.status);
      return {
        id: row.id,
        name: row.name,
        assetCode: row.assetCode,
        locationLabel: row.unit.name,
        status: row.status,
        conditionLabel: condition.summaryLabel,
        retired: isAssetLifecycleRetired(row.status),
      };
    });

  const categoryOptions: PmBuilderCategoryOption[] = categories
    .filter((row) => !row.archivedAt || row.id === input.currentCategoryId)
    .map((row) => ({
      id: row.id,
      label: row.label,
      archived: Boolean(row.archivedAt),
    }));

  const procedureOptions: PmBuilderProcedureOption[] = procedures
    .filter((row) => isKnowledgeProcedureCategory(row.article.category))
    .map((row) => ({
      versionId: row.id,
      articleId: row.article.id,
      title: row.article.title || row.title,
      version: row.version,
    }));

  if (input.currentProcedureVersionId) {
    const already = procedureOptions.some((row) => row.versionId === input.currentProcedureVersionId);
    if (!already) {
      const pinned = await client.knowledgeArticleVersion.findFirst({
        where: { id: input.currentProcedureVersionId },
        select: {
          id: true,
          version: true,
          title: true,
          article: { select: { id: true, title: true, category: true } },
        },
      });
      if (pinned) {
        procedureOptions.unshift({
          versionId: pinned.id,
          articleId: pinned.article.id,
          title: pinned.article.title || pinned.title,
          version: pinned.version,
        });
      }
    }
  }

  const templateOptions: PmBuilderTemplateOption[] = templates.map((row) => ({
    id: row.id,
    name: row.name,
    purposeType: row.purposeType,
    version: row.version,
  }));

  const employeeOptions: PmBuilderEmployeeOption[] = employees.map((row) => ({
    id: row.id,
    name: `${row.firstName} ${row.lastName}`.trim(),
  }));

  return { assetOptions, categoryOptions, procedureOptions, templateOptions, employeeOptions };
}

export async function loadPmPlanList(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    filter?: PmPlanListFilter;
    assetQuery?: string;
    categoryId?: string;
    now?: Date;
    client?: DbClient;
  },
): Promise<{
  authority: PmPlanAuthorityDecision;
  facilityToday: CivilDate;
  rows: PmPlanListRow[];
}> {
  const client = input.client ?? prisma;
  const authority = await resolvePmPlanAuthority(
    session,
    input.facilityId,
    input.departmentId,
    client,
  );
  const facility = await client.facility.findFirst({
    where: { id: input.facilityId },
    select: { timezone: true },
  });
  const facilityToday = facilityCivilToday(facility?.timezone, input.now);

  if (!authority.canView) {
    return { authority, facilityToday, rows: [] };
  }

  const where: Prisma.PreventiveMaintenancePlanWhereInput = {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
  };
  if (input.filter === "published") where.status = "PUBLISHED";
  if (input.filter === "draft") where.status = "DRAFT";
  if (input.filter === "retired") where.status = "RETIRED";
  if (input.assetQuery?.trim()) {
    const q = input.assetQuery.trim();
    where.asset = {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { assetCode: { contains: q, mode: "insensitive" } },
      ],
    };
  }

  const plans = await client.preventiveMaintenancePlan.findMany({
    where,
    include: {
      asset: {
        select: {
          id: true,
          name: true,
          assetCode: true,
          status: true,
        },
      },
      versions: {
        include: versionInclude,
        orderBy: { version: "asc" },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  const rows: PmPlanListRow[] = [];
  for (const plan of plans) {
    const draft = [...plan.versions].reverse().find((row) => row.status === "DRAFT") ?? null;
    const published = plan.versions.find((row) => row.status === "PUBLISHED") ?? null;
    const display = draft ?? published ?? plan.versions[plan.versions.length - 1];
    if (!display) continue;
    if (input.categoryId && display.maintenanceCategoryId !== input.categoryId) continue;

    const nextProjectedDate = nextProjectedScheduledDate({
      versions: plan.versions.map((row) => ({
        id: row.id,
        status: row.status,
        effectiveDate: row.effectiveDate,
        intervalMonths: row.intervalMonths,
        anchorDate: row.anchorDate,
      })),
      facilityToday,
      draft: draft
        ? {
            intervalMonths: draft.intervalMonths,
            anchorDate: draft.anchorDate,
            effectiveDate: draft.effectiveDate ?? facilityToday,
          }
        : null,
    });

    rows.push({
      id: plan.id,
      name: display.name,
      assetName: plan.asset.name,
      assetCode: plan.asset.assetCode,
      assetStatus: plan.asset.status,
      status: presentPmPlanStatus({
        planStatus: plan.status,
        hasSuccessorDraft: Boolean(published && draft),
      }),
      publishedVersion: published?.version ?? null,
      cadenceSummary: formatCadenceSummary(display.intervalMonths),
      nextProjectedDate,
      categoryLabel: display.maintenanceCategory?.label ?? null,
      priorityLabel: presentPmPriority(display.priority),
      procedureLabel: procedureLabel(display.procedureVersion),
      assigneeLabel: employeeName(display.defaultAssignedEmployee),
      generationWarning: pmGenerationWarning({
        planStatus: plan.status,
        assetStatus: plan.asset.status,
      }),
    });
  }

  return { authority, facilityToday, rows };
}

export async function loadPmPlanEditor(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    planId: string;
    now?: Date;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolvePmPlanAuthority(
    session,
    input.facilityId,
    input.departmentId,
    client,
  );
  const facility = await client.facility.findFirst({
    where: { id: input.facilityId },
    select: { timezone: true },
  });
  const facilityToday = facilityCivilToday(facility?.timezone, input.now);

  const plan = await client.preventiveMaintenancePlan.findFirst({
    where: {
      id: input.planId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: {
      asset: {
        select: {
          id: true,
          name: true,
          assetCode: true,
          status: true,
          unit: { select: { name: true } },
        },
      },
      versions: {
        include: versionInclude,
        orderBy: { version: "asc" },
      },
    },
  });
  if (!plan) return null;

  const draft = [...plan.versions].reverse().find((row) => row.status === "DRAFT") ?? null;
  const published = plan.versions.find((row) => row.status === "PUBLISHED") ?? null;
  const editing = draft ?? published ?? plan.versions[plan.versions.length - 1]!;
  const options = await loadPmBuilderOptions(
    {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      currentAssetId: plan.assetId,
      currentCategoryId: editing.maintenanceCategoryId,
      currentProcedureVersionId: editing.procedureVersionId,
    },
    client,
  );

  return {
    authority,
    facilityToday,
    plan: {
      id: plan.id,
      status: plan.status,
      assetId: plan.assetId,
      asset: {
        id: plan.asset.id,
        name: plan.asset.name,
        assetCode: plan.asset.assetCode,
        status: plan.asset.status,
        locationLabel: plan.asset.unit.name,
        conditionLabel: presentAssetLifecycleAndCondition(plan.asset.status).summaryLabel,
      },
      hasSuccessorDraft: Boolean(published && draft),
      publishedVersion: published
        ? {
            id: published.id,
            version: published.version,
            status: published.status,
            effectiveDate: published.effectiveDate
              ? parseCivilDate(published.effectiveDate)
              : null,
          }
        : null,
      editing: {
        id: editing.id,
        version: editing.version,
        status: editing.status,
        createdFromVersionId: editing.createdFromVersionId,
        name: editing.name,
        instructions: editing.instructions,
        maintenanceCategoryId: editing.maintenanceCategoryId,
        intervalMonths: editing.intervalMonths,
        anchorDate: parseCivilDate(editing.anchorDate),
        effectiveDate: editing.effectiveDate ? parseCivilDate(editing.effectiveDate) : null,
        generationLeadDays: editing.generationLeadDays,
        priority: editing.priority,
        procedureVersionId: editing.procedureVersionId,
        defaultAssignedEmployeeId: editing.defaultAssignedEmployeeId,
        recordRequirements: editing.recordRequirements.map((row) => ({
          templateId: row.templateId,
          templateName: row.templateName,
          templateVersion: row.templateVersion,
          sortOrder: row.sortOrder,
        })),
      },
      history: plan.versions.map((row) => ({
        id: row.id,
        version: row.version,
        status: row.status,
        effectiveDate: row.effectiveDate ? parseCivilDate(row.effectiveDate) : null,
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
        cadenceSummary: formatCadenceSummary(row.intervalMonths),
        procedureLabel: procedureLabel(row.procedureVersion),
        name: row.name,
      })),
      generationWarning: pmGenerationWarning({
        planStatus: plan.status,
        assetStatus: plan.asset.status,
      }),
    },
    options,
  };
}

/**
 * Internal Plant Build access.
 * Plant Product installed/authorized, or PLANT_OPERATIONS_ENABLED override.
 * Does not use customer Marketplace entitlement while Plant remains DEVELOPMENT.
 */
export async function loadPlantPmBuilderDepartment(
  session: AppJwtPayload,
  departmentId: string,
) {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId: session.facilityId, isActive: true },
    select: { id: true, key: true, name: true },
  });
  if (!department || department.key !== "PLANT") return null;
  if (!(await isPlantRuntimeEnabled(session.facilityId, session))) return null;
  return department;
}

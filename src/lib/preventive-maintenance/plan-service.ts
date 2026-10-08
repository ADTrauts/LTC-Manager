/**
 * Preventive Maintenance Plan identity and version writes.
 *
 * Published versions are immutable. Successor drafts copy configuration.
 * These services do not materialize occurrences or generate Work Orders.
 */

import type {
  Prisma,
  PrismaClient,
  RepairPriority,
} from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { FacilitySession } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { isAssetLifecycleRetired } from "@/lib/asset-operations/ownership";
import { isKnowledgeProcedureCategory } from "@/lib/knowledge/version-semantics";
import { prisma } from "@/lib/prisma";

import {
  requirePmDraft,
  requirePmPublish,
  requirePmRetire,
  resolvePmPlanAuthority,
} from "./authority";
import { type CivilDate, civilDateToUtcMidnight, facilityCivilToday, parseCivilDate } from "./civil-date";
import { compareCivilDates } from "./civil-date";
import {
  assertPmPublishedVersionImmutable,
  isPmPriorityPublishable,
  nextPmPlanVersionNumber,
} from "./version-semantics";

type DbClient = PrismaClient | Prisma.TransactionClient;

const versionDetailInclude = {
  recordRequirements: { orderBy: { sortOrder: "asc" as const } },
} as const;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

export type PmRecordRequirementInput = {
  templateId: string;
  sortOrder?: number;
};

export type PmPlanDraftInput = {
  name: string;
  instructions?: string | null;
  maintenanceCategoryId?: string | null;
  intervalMonths?: number;
  anchorDate: CivilDate | Date;
  effectiveDate?: CivilDate | Date | null;
  generationLeadDays?: number;
  priority?: RepairPriority;
  procedureVersionId?: string | null;
  defaultAssignedEmployeeId?: string | null;
  recordRequirements?: PmRecordRequirementInput[];
};

async function loadFacilityTimezone(client: DbClient, facilityId: string) {
  const facility = await client.facility.findFirst({
    where: { id: facilityId },
    select: { timezone: true },
  });
  if (!facility) throw new Error("Facility not found.");
  return facility.timezone;
}

async function maxVersion(client: DbClient, planId: string): Promise<number> {
  const aggregate = await client.preventiveMaintenancePlanVersion.aggregate({
    where: { planId },
    _max: { version: true },
  });
  return aggregate._max.version ?? 0;
}

function civilDateValue(value: CivilDate | Date): Date {
  return civilDateToUtcMidnight(parseCivilDate(value));
}

function requirementCreates(rows: PmRecordRequirementInput[] | undefined) {
  return (rows ?? []).map((row, index) => ({
    id: cuidLike(),
    templateId: row.templateId,
    templateStableKey: "",
    templateVersion: 0,
    templateName: "",
    sortOrder: row.sortOrder ?? index,
  }));
}

async function snapshotRecordRequirements(
  client: DbClient,
  input: {
    facilityId: string;
    planVersionId: string;
    rows: PmRecordRequirementInput[];
  },
) {
  const unique = new Map<string, PmRecordRequirementInput>();
  for (const row of input.rows) {
    unique.set(row.templateId, row);
  }
  const snapshots = [];
  let sort = 0;
  for (const row of unique.values()) {
    const template = await client.operationalTemplate.findFirst({
      where: { id: row.templateId, facilityId: input.facilityId },
    });
    if (!template) throw new Error("Required Record template not found.");
    if (template.status !== "PUBLISHED") {
      throw new Error("PM Plan required Records must pin a published template version.");
    }
    snapshots.push({
      id: cuidLike(),
      planVersionId: input.planVersionId,
      templateId: template.id,
      templateStableKey: template.stableKey,
      templateVersion: template.version,
      templateName: template.name,
      sortOrder: row.sortOrder ?? sort,
    });
    sort += 1;
  }
  return snapshots;
}

async function validateDraftShape(draft: PmPlanDraftInput) {
  const name = draft.name.trim();
  if (!name) throw new Error("PM Plan name is required.");
  const intervalMonths = draft.intervalMonths ?? 1;
  if (!Number.isInteger(intervalMonths) || intervalMonths < 1) {
    throw new Error("intervalMonths must be an integer >= 1.");
  }
  const generationLeadDays = draft.generationLeadDays ?? 7;
  if (!Number.isInteger(generationLeadDays) || generationLeadDays < 0) {
    throw new Error("generationLeadDays must be an integer >= 0.");
  }
  const priority = draft.priority ?? "MEDIUM";
  parseCivilDate(draft.anchorDate);
  if (draft.effectiveDate) parseCivilDate(draft.effectiveDate);
  return { name, intervalMonths, generationLeadDays, priority };
}

async function validatePublishableVersion(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    assetId: string;
    draft: PmPlanDraftInput;
    facilityToday: CivilDate;
    priorEffectiveDate?: CivilDate | null;
    firstPublish: boolean;
  },
) {
  const shaped = await validateDraftShape(input.draft);
  if (!isPmPriorityPublishable(shaped.priority)) {
    throw new Error("PM Plans cannot publish with EMERGENCY priority.");
  }
  if (!input.draft.maintenanceCategoryId) {
    throw new Error("Maintenance category is required to publish a PM Plan.");
  }

  const asset = await client.asset.findFirst({
    where: { id: input.assetId },
    include: { unit: { select: { facilityId: true } } },
  });
  if (!asset || asset.unit.facilityId !== input.facilityId) {
    throw new Error("Asset not found.");
  }
  if (isAssetLifecycleRetired(asset.status)) {
    throw new Error("Cannot publish a PM Plan for a retired Asset.");
  }

  const category = await client.maintenanceCategory.findFirst({
    where: {
      id: input.draft.maintenanceCategoryId,
      facilityId: input.facilityId,
    },
  });
  if (!category) throw new Error("Maintenance category not found.");
  if (category.archivedAt) {
    throw new Error("Cannot publish a PM Plan with an archived maintenance category.");
  }

  if (input.draft.procedureVersionId) {
    const version = await client.knowledgeArticleVersion.findFirst({
      where: { id: input.draft.procedureVersionId },
      include: { article: { select: { facilityId: true, category: true } } },
    });
    if (!version) throw new Error("Procedure version not found.");
    if (version.article.facilityId !== input.facilityId) {
      throw new Error("Procedure version belongs to another facility.");
    }
    if (!isKnowledgeProcedureCategory(version.article.category)) {
      throw new Error("PM Plans may pin only Procedure (SOP) Knowledge versions.");
    }
    if (version.status !== "PUBLISHED") {
      throw new Error("PM Plans may pin only PUBLISHED Procedure versions.");
    }
  }

  if (input.draft.defaultAssignedEmployeeId) {
    const employee = await client.employee.findFirst({
      where: {
        id: input.draft.defaultAssignedEmployeeId,
        facilityId: input.facilityId,
      },
    });
    if (!employee) throw new Error("Default assignee not found.");
  }

  const effectiveDate = parseCivilDate(
    input.draft.effectiveDate ?? input.facilityToday,
  );
  if (compareCivilDates(effectiveDate, input.facilityToday) < 0) {
    throw new Error("PM Plan effectiveDate cannot be before facility today.");
  }
  if (
    !input.firstPublish &&
    input.priorEffectiveDate &&
    compareCivilDates(effectiveDate, input.priorEffectiveDate) <= 0
  ) {
    throw new Error("Successor effectiveDate must be after the previous version effectiveDate.");
  }

  await snapshotRecordRequirements(client, {
    facilityId: input.facilityId,
    planVersionId: "validate-only",
    rows: input.draft.recordRequirements ?? [],
  });

  return { ...shaped, effectiveDate };
}

export async function createPmPlanWithDraft(
  session: FacilitySession,
  input: {
    facilityId: string;
    departmentId: string;
    assetId: string;
    draft: PmPlanDraftInput;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolvePmPlanAuthority(
    session,
    input.facilityId,
    input.departmentId,
    client,
  );
  requirePmDraft(authority);
  const shaped = await validateDraftShape(input.draft);

  const asset = await client.asset.findFirst({
    where: { id: input.assetId },
    include: { unit: { select: { facilityId: true } } },
  });
  if (!asset || asset.unit.facilityId !== input.facilityId) {
    throw new Error("Asset not found.");
  }

  const actorUserId = sessionUserIdForFk(session);
  const plan = await client.preventiveMaintenancePlan.create({
    data: {
      id: cuidLike(),
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      assetId: input.assetId,
      status: "DRAFT",
      createdByUserId: actorUserId,
      versions: {
        create: {
          id: cuidLike(),
          version: 1,
          status: "DRAFT",
          name: shaped.name,
          instructions: input.draft.instructions?.trim() || null,
          maintenanceCategoryId: input.draft.maintenanceCategoryId ?? null,
          intervalMonths: shaped.intervalMonths,
          anchorDate: civilDateValue(input.draft.anchorDate),
          effectiveDate: input.draft.effectiveDate
            ? civilDateValue(input.draft.effectiveDate)
            : null,
          generationLeadDays: shaped.generationLeadDays,
          priority: shaped.priority,
          procedureVersionId: input.draft.procedureVersionId ?? null,
          defaultAssignedEmployeeId: input.draft.defaultAssignedEmployeeId ?? null,
          recordRequirements: {
            create: requirementCreates(input.draft.recordRequirements),
          },
        },
      },
    },
    include: { versions: { include: versionDetailInclude } },
  });

  return plan;
}

export async function updatePmPlanDraft(
  session: FacilitySession,
  input: {
    facilityId: string;
    departmentId: string;
    planId: string;
    draft: PmPlanDraftInput;
    assetId?: string;
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
  requirePmDraft(authority);
  const shaped = await validateDraftShape(input.draft);

  const plan = await client.preventiveMaintenancePlan.findFirst({
    where: {
      id: input.planId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: { versions: true },
  });
  if (!plan) throw new Error("PM Plan not found.");
  if (plan.status === "RETIRED") throw new Error("Retired PM Plans cannot be edited.");

  const draft = plan.versions.find((row) => row.status === "DRAFT");
  if (!draft) {
    throw new Error("No draft version to edit. Create a successor draft from the published version.");
  }
  assertPmPublishedVersionImmutable(draft.status);

  if (plan.status === "DRAFT" && input.assetId && input.assetId !== plan.assetId) {
    const asset = await client.asset.findFirst({
      where: { id: input.assetId },
      include: { unit: { select: { facilityId: true } } },
    });
    if (!asset || asset.unit.facilityId !== input.facilityId) {
      throw new Error("Asset not found.");
    }
    await client.preventiveMaintenancePlan.update({
      where: { id: plan.id },
      data: { assetId: input.assetId },
    });
  }

  await client.preventiveMaintenancePlanRecordRequirement.deleteMany({
    where: { planVersionId: draft.id },
  });

  return client.preventiveMaintenancePlanVersion.update({
    where: { id: draft.id },
    data: {
      name: shaped.name,
      instructions: input.draft.instructions?.trim() || null,
      maintenanceCategoryId: input.draft.maintenanceCategoryId ?? null,
      intervalMonths: shaped.intervalMonths,
      anchorDate: civilDateValue(input.draft.anchorDate),
      effectiveDate: input.draft.effectiveDate
        ? civilDateValue(input.draft.effectiveDate)
        : null,
      generationLeadDays: shaped.generationLeadDays,
      priority: shaped.priority,
      procedureVersionId: input.draft.procedureVersionId ?? null,
      defaultAssignedEmployeeId: input.draft.defaultAssignedEmployeeId ?? null,
      recordRequirements: {
        create: requirementCreates(input.draft.recordRequirements),
      },
    },
    include: versionDetailInclude,
  });
}

export async function publishPmPlanVersion(
  session: FacilitySession,
  input: {
    facilityId: string;
    departmentId: string;
    planId: string;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolvePmPlanAuthority(
    session,
    input.facilityId,
    input.departmentId,
    client,
  );
  requirePmPublish(authority);

  const run = async (db: DbClient) => {
    const plan = await db.preventiveMaintenancePlan.findFirst({
      where: {
        id: input.planId,
        facilityId: input.facilityId,
        departmentId: input.departmentId,
      },
      include: {
        versions: { include: versionDetailInclude, orderBy: { version: "asc" } },
      },
    });
    if (!plan) throw new Error("PM Plan not found.");
    if (plan.status === "RETIRED") throw new Error("Retired PM Plans cannot be published.");

    const draft = [...plan.versions].reverse().find((row) => row.status === "DRAFT");
    if (!draft) throw new Error("Only draft PM Plan versions can be published.");
    assertPmPublishedVersionImmutable(draft.status);

    const published = plan.versions.find((row) => row.status === "PUBLISHED") ?? null;
    const timezone = await loadFacilityTimezone(db, input.facilityId);
    const facilityToday = facilityCivilToday(timezone, input.now);
    const draftInput: PmPlanDraftInput = {
      name: draft.name,
      instructions: draft.instructions,
      maintenanceCategoryId: draft.maintenanceCategoryId,
      intervalMonths: draft.intervalMonths,
      anchorDate: draft.anchorDate,
      effectiveDate: draft.effectiveDate,
      generationLeadDays: draft.generationLeadDays,
      priority: draft.priority,
      procedureVersionId: draft.procedureVersionId,
      defaultAssignedEmployeeId: draft.defaultAssignedEmployeeId,
      recordRequirements: draft.recordRequirements.map((row) => ({
        templateId: row.templateId,
        sortOrder: row.sortOrder,
      })),
    };

    const validated = await validatePublishableVersion(db, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      assetId: plan.assetId,
      draft: draftInput,
      facilityToday,
      priorEffectiveDate: published?.effectiveDate
        ? parseCivilDate(published.effectiveDate)
        : null,
      firstPublish: !published,
    });

    const snapshots = await snapshotRecordRequirements(db, {
      facilityId: input.facilityId,
      planVersionId: draft.id,
      rows: draftInput.recordRequirements ?? [],
    });

    await db.preventiveMaintenancePlanRecordRequirement.deleteMany({
      where: { planVersionId: draft.id },
    });
    if (snapshots.length > 0) {
      await db.preventiveMaintenancePlanRecordRequirement.createMany({ data: snapshots });
    }

    if (published) {
      await db.preventiveMaintenancePlanVersion.update({
        where: { id: published.id },
        data: { status: "SUPERSEDED" },
      });
    }

    const actorUserId = sessionUserIdForFk(session);
    const frozen = await db.preventiveMaintenancePlanVersion.update({
      where: { id: draft.id },
      data: {
        status: "PUBLISHED",
        effectiveDate: civilDateValue(validated.effectiveDate),
        publishedAt: input.now ?? new Date(),
        publishedByUserId: actorUserId,
      },
      include: versionDetailInclude,
    });

    await db.preventiveMaintenancePlan.update({
      where: { id: plan.id },
      data: { status: "PUBLISHED", retiredAt: null, retiredByUserId: null },
    });

    return frozen;
  };

  if (input.client) return run(input.client);
  return prisma.$transaction((tx) => run(tx));
}

export async function createPmPlanSuccessorDraft(
  session: FacilitySession,
  input: {
    facilityId: string;
    departmentId: string;
    planId: string;
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
  requirePmDraft(authority);

  const plan = await client.preventiveMaintenancePlan.findFirst({
    where: {
      id: input.planId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: {
      versions: { include: versionDetailInclude, orderBy: { version: "asc" } },
    },
  });
  if (!plan) throw new Error("PM Plan not found.");
  if (plan.status === "RETIRED") {
    throw new Error("Retired PM Plans cannot receive successor drafts.");
  }

  const existingDraft = plan.versions.find((row) => row.status === "DRAFT");
  if (existingDraft) return existingDraft;

  const published = [...plan.versions].reverse().find((row) => row.status === "PUBLISHED");
  if (!published) {
    throw new Error("Successor drafts are created from a published PM Plan version.");
  }

  const version = nextPmPlanVersionNumber(await maxVersion(client, plan.id));
  return client.preventiveMaintenancePlanVersion.create({
    data: {
      id: cuidLike(),
      planId: plan.id,
      version,
      status: "DRAFT",
      createdFromVersionId: published.id,
      name: published.name,
      instructions: published.instructions,
      maintenanceCategoryId: published.maintenanceCategoryId,
      intervalMonths: published.intervalMonths,
      anchorDate: published.anchorDate,
      effectiveDate: null,
      generationLeadDays: published.generationLeadDays,
      priority: published.priority,
      procedureVersionId: published.procedureVersionId,
      defaultAssignedEmployeeId: published.defaultAssignedEmployeeId,
      recordRequirements: {
        create: published.recordRequirements.map((row, index) => ({
          id: cuidLike(),
          templateId: row.templateId,
          templateStableKey: row.templateStableKey,
          templateVersion: row.templateVersion,
          templateName: row.templateName,
          sortOrder: row.sortOrder ?? index,
        })),
      },
    },
    include: versionDetailInclude,
  });
}

export async function retirePmPlan(
  session: FacilitySession,
  input: {
    facilityId: string;
    departmentId: string;
    planId: string;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolvePmPlanAuthority(
    session,
    input.facilityId,
    input.departmentId,
    client,
  );
  requirePmRetire(authority);

  const plan = await client.preventiveMaintenancePlan.findFirst({
    where: {
      id: input.planId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
  });
  if (!plan) throw new Error("PM Plan not found.");
  if (plan.status !== "PUBLISHED") {
    throw new Error("Only published PM Plans can be retired.");
  }

  return client.preventiveMaintenancePlan.update({
    where: { id: plan.id },
    data: {
      status: "RETIRED",
      retiredAt: input.now ?? new Date(),
      retiredByUserId: sessionUserIdForFk(session),
    },
  });
}

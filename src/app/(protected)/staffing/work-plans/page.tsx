import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { WorkPlanBuilderPanel } from "@/components/department-work/work-plan-builder-panel";
import { PageHeader } from "@/components/design-system";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import {
  isAnyStaffingOperationalFeatureEnabled,
  resolveStaffingOperationalDepartment,
} from "@/lib/department-operations";
import {
  listWorkPlanPresetSummaries,
  loadBuilderWorkPlans,
  resolveWorkAuthority,
} from "@/lib/department-work";
import { prisma } from "@/lib/prisma";

export default async function WorkPlanBuilderPage({
  searchParams,
}: {
  searchParams?: Promise<{ plan?: string }>;
}) {
  noStore();
  const params = searchParams ? await searchParams : {};

  if (!isAnyStaffingOperationalFeatureEnabled("workPlans")) {
    redirect("/staffing");
  }

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");

  if (!hasAtLeastRole(session.role, "MANAGER")) {
    redirect("/workspace");
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const department = await resolveStaffingOperationalDepartment({
    facilityId: session.facilityId,
    activeDepartmentId: deptNav.activeDepartmentId,
    feature: "workPlans",
  });

  if (!department) {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader title="Work Plans" subtitle="No operational department found." compact />
      </section>
    );
  }

  const authority = await resolveWorkAuthority(session, session.facilityId, department.id);
  if (!authority.canViewDepartment && !authority.canManage) {
    return (
      <section className="mx-auto max-w-5xl space-y-4" data-testid="work-plan-builder-denied">
        <PageHeader
          title="Work Plans"
          subtitle={authority.reason ?? "Insufficient authority for Work Plans."}
          compact
        />
      </section>
    );
  }

  const builder = await loadBuilderWorkPlans({
    session,
    facilityId: session.facilityId,
    departmentId: department.id,
  });

  const [procedures, units, cycles, templates] = await Promise.all([
    prisma.knowledgeArticle.findMany({
      where: {
        facilityId: session.facilityId,
        status: "PUBLISHED",
        OR: [{ departmentId: department.id }, { departmentId: null }],
      },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
      take: 200,
    }),
    prisma.unit.findMany({
      where: {
        facilityId: session.facilityId,
        isActive: true,
        departmentResponsibilities: { some: { departmentId: department.id } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.departmentOperationalCycle.findMany({
      where: {
        facilityId: session.facilityId,
        departmentId: department.id,
        status: "PUBLISHED",
      },
      select: { stableKey: true, label: true },
      orderBy: [{ displaySequence: "asc" }, { stableKey: "asc" }],
      distinct: ["stableKey"],
    }),
    prisma.operationalTemplate.findMany({
      where: {
        facilityId: session.facilityId,
        departmentId: department.id,
        status: "PUBLISHED",
      },
      select: { id: true, stableKey: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const plans = builder.plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    status: plan.status,
    version: plan.version,
    stableKey: plan.stableKey,
    presetKey: plan.presetKey,
    description: plan.description,
    weekdays: plan.weekdays,
    effectiveStartDate: plan.effectiveStartDate
      ? plan.effectiveStartDate.toISOString().slice(0, 10)
      : null,
    effectiveEndDate: plan.effectiveEndDate
      ? plan.effectiveEndDate.toISOString().slice(0, 10)
      : null,
    items: plan.items.map((item) => ({
      id: item.id,
      itemKey: item.itemKey,
      label: item.label,
      instructions: item.instructions,
      displaySequence: item.displaySequence,
      priority: item.priority,
      completionMode: item.completionMode,
      responsibilityMode: item.responsibilityMode,
      scheduleKind: item.scheduleKind,
      cycleStableKeys: item.cycleStableKeys,
      windowStartLocal: item.windowStartLocal,
      windowEndLocal: item.windowEndLocal,
      roleKeys: item.roleKeys,
      knowledgeArticleId: item.knowledgeArticleId,
      procedureTitleSnapshot: item.procedureTitleSnapshot,
      linkedTemplateStableKey: item.linkedTemplateStableKey,
      linkedTemplateId: item.linkedTemplateId,
      supervisorVisible: item.supervisorVisible,
    })),
    applicabilities: plan.applicabilities.map((a) => ({
      kind: a.kind,
      unitId: a.unitId,
      spaceId: a.spaceId,
      spaceType: a.spaceType,
      assetId: a.assetId,
      assetType: a.assetType,
    })),
    _count: { items: plan._count.items },
  }));

  return (
    <section className="mx-auto max-w-6xl space-y-4" data-testid="work-plan-builder-page">
      <PageHeader
        title="Work Plans"
        subtitle={`Configure ${department.name} Work Plans. Publish creates an immutable version. Viewing a Procedure never completes Work.`}
        compact
      />
      <p className="text-sm text-slate-600">
        Related:{" "}
        <Link href="/staffing/templates" className="underline">
          Operational Templates
        </Link>{" "}
        ·{" "}
        <Link href="/staffing/cycles" className="underline">
          Cycles
        </Link>
      </p>
      <WorkPlanBuilderPanel
        key={params.plan ?? "work-plan-builder"}
        facilityId={session.facilityId}
        departmentId={department.id}
        canManage={builder.canManage}
        canPublish={builder.canPublish}
        initialPlanId={params.plan ?? null}
        plans={plans}
        presets={listWorkPlanPresetSummaries(department.key)}
        procedures={procedures}
        units={units}
        cycleOptions={cycles}
        templates={templates}
      />
    </section>
  );
}

import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { LogsTabsClient, type LogsTabId } from "@/components/logs/logs-tabs-client";
import { MealType } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { departmentFilterIdsForSession } from "@/lib/department-scope";
import {
  loadContextualKnowledge,
  toContextualKnowledgeClientArticles,
} from "@/lib/knowledge/contextual";
import { ensureMenuSettingsDefaults, menuForDate, menuPeriodKeyForMealType } from "@/lib/menu-cycle";
import { loadFacilityMenuData } from "@/lib/menu-db";
import { prisma } from "@/lib/prisma";

const LOG_TABS: LogsTabId[] = ["templates", "assignments", "submit", "logs"];

type LogsPageProps = {
  searchParams: Promise<{ assignmentId?: string; tab?: string; logTab?: string }>;
};

function parseTab(raw: string | undefined, hasAssignmentId: boolean): LogsTabId {
  if (hasAssignmentId && (!raw || !LOG_TABS.includes(raw as LogsTabId))) {
    return "submit";
  }
  if (raw && LOG_TABS.includes(raw as LogsTabId)) {
    return raw as LogsTabId;
  }
  return "templates";
}

export default async function LogsPage({ searchParams }: LogsPageProps) {
  noStore();
  const params = await searchParams;
  const assignmentId = typeof params.assignmentId === "string" ? params.assignmentId.trim() : "";
  const tabRaw = typeof params.tab === "string" ? params.tab.trim() : undefined;
  const logTab = typeof params.logTab === "string" ? params.logTab.trim() : "";
  const activeTab = parseTab(tabRaw, assignmentId.length > 0);

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  const facilityId = session.facilityId;
  const deptFilter = await departmentFilterIdsForSession(session);
  const templateDeptFilter =
    deptFilter === null
      ? {}
      : { OR: [{ departmentId: null }, { departmentId: { in: deptFilter } }] };

  const [templates, units, assignments, submissionsRaw, mealServiceRaw, menuData] = await Promise.all([
    prisma.logTemplate.findMany({
      where: { facilityId, ...templateDeptFilter },
      orderBy: { createdAt: "desc" },
      include: {
        fields: { orderBy: { fieldOrder: "asc" } },
      },
    }),
    prisma.unit.findMany({
      where: { isActive: true, facilityId },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.logAssignment.findMany({
      where: {
        unit: { facilityId },
        ...(deptFilter === null
          ? {}
          : { template: { OR: [{ departmentId: null }, { departmentId: { in: deptFilter } }] } }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        unit: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
      },
    }),
    prisma.logSubmission.findMany({
      where: {
        unit: { facilityId },
        ...(deptFilter === null
          ? {}
          : { template: { OR: [{ departmentId: null }, { departmentId: { in: deptFilter } }] } }),
      },
      take: 100,
      orderBy: { submittedAt: "desc" },
      include: {
        unit: { select: { name: true } },
        template: { select: { name: true, category: true } },
        submittedBy: { select: { displayName: true } },
      },
    }),
    prisma.serveryMealServiceEvent.findMany({
      where: {
        unit: { facilityId },
        OR: [{ mealServiceReadyAt: { not: null } }, { mealServiceStartedAt: { not: null } }],
      },
      take: 100,
      orderBy: [{ serviceDate: "desc" }, { updatedAt: "desc" }],
      include: {
        unit: { select: { name: true } },
        readyRecordedBy: { select: { displayName: true } },
        startedRecordedBy: { select: { displayName: true } },
      },
    }),
    loadFacilityMenuData(prisma, facilityId),
  ]);
  const menuSettings = ensureMenuSettingsDefaults(menuData.settingsRaw);
  const todaysMenu = menuForDate({
    date: new Date(),
    settings: menuSettings,
    periods: menuSettings.periods,
    menuItems: menuData.menuItems,
  });
  const tempChecklistByMeal: Record<MealType, string[]> = {
    BREAKFAST: [],
    LUNCH: [],
    DINNER: [],
  };
  (Object.values(MealType) as MealType[]).forEach((mealType) => {
    const periodKey = menuPeriodKeyForMealType(mealType, menuSettings.periods);
    const bucket = periodKey ? Object.values(todaysMenu.grouped[periodKey] ?? {}).flatMap((values) => values) : [];
    tempChecklistByMeal[mealType] = bucket;
  });

  const submissions = submissionsRaw.map((row) => ({
    id: row.id,
    submittedAt: row.submittedAt.toISOString(),
    status: row.status,
    unit: row.unit,
    template: row.template,
    templateCategory: row.template.category,
    submittedBy: row.submittedBy,
  }));
  const mealServiceEvents = mealServiceRaw.map((row) => ({
    id: row.id,
    serviceDate: row.serviceDate.toISOString(),
    mealType: row.mealType,
    mealServiceReadyAt: row.mealServiceReadyAt?.toISOString() ?? null,
    mealServiceStartedAt: row.mealServiceStartedAt?.toISOString() ?? null,
    unit: row.unit,
    readyRecordedBy: row.readyRecordedBy,
    startedRecordedBy: row.startedRecordedBy,
  }));

  const selectedAssignment =
    assignmentId.length > 0
      ? await prisma.logAssignment.findFirst({
          where: { id: assignmentId, unit: { facilityId } },
          include: {
            unit: { select: { id: true, name: true } },
            template: {
              include: {
                fields: { orderBy: { fieldOrder: "asc" } },
              },
            },
          },
        })
      : null;

  const selectedForClient = selectedAssignment
    ? {
        id: selectedAssignment.id,
        mealType: selectedAssignment.mealType,
        unit: selectedAssignment.unit,
        template: {
          id: selectedAssignment.template.id,
          name: selectedAssignment.template.name,
          category: selectedAssignment.template.category,
          fields: selectedAssignment.template.fields.map((f) => ({
            id: f.id,
            label: f.label,
            fieldType: f.fieldType,
            isRequired: f.isRequired,
            unitLabel: f.unitLabel,
            fieldOptions: f.fieldOptions,
            fieldOrder: f.fieldOrder,
          })),
        },
      }
    : null;

  const logKnowledge = selectedAssignment
    ? await loadContextualKnowledge({
        facilityId,
        viewerDepartmentIds: deptFilter,
        unitId: selectedAssignment.unit.id,
        logTemplateId: selectedAssignment.template.id,
        includeFacilityWideReference: false,
        limit: 6,
      })
    : { articles: [], count: 0 };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Logs</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Build reusable templates, assign them to units, submit entries, and review history.
        </p>
      </header>

      <LogsTabsClient
        activeTab={activeTab}
        templates={templates}
        units={units}
        assignments={assignments}
        submissions={submissions}
        mealServiceEvents={mealServiceEvents}
        activeLogSubtab={logTab}
        selectedAssignment={selectedForClient}
        tempChecklistByMeal={tempChecklistByMeal}
        menuUnavailableReason={menuData.unavailableReason}
        submitKnowledgeArticles={toContextualKnowledgeClientArticles(logKnowledge.articles)}
      />
    </section>
  );
}

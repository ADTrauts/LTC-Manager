import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SupervisorWorkActionsPanel } from "@/components/department-work/supervisor-work-actions-panel";
import { PlantRequestRoutingPanel } from "@/components/operational-requests/plant-request-routing-panel";
import { PlantTriagePanel } from "@/components/operational-requests/plant-triage-panel";
import { PageHeader } from "@/components/design-system";
import { SupervisorOperationsBoardView } from "@/components/supervisor-operations/supervisor-operations-board-view";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import {
  isAnyStaffingOperationalFeatureEnabled,
  isDepartmentWorkPlansEnabled,
  resolveStaffingOperationalDepartment,
} from "@/lib/department-operations";
import { loadSupervisorOperationsViewModel } from "@/lib/dietary-job-flow";
import { isPlantOperationsEnabled } from "@/lib/feature-flags";
import { listRoutesForFacility } from "@/lib/operational-requests";
import { prisma } from "@/lib/prisma";

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

type OperationsPageProps = {
  searchParams?: Promise<{
    floor?: string | string[];
    unit?: string | string[];
    zone?: string | string[];
    employee?: string | string[];
  }>;
};

export default async function SupervisorOperationsBoardPage({
  searchParams,
}: OperationsPageProps) {
  noStore();

  if (!isAnyStaffingOperationalFeatureEnabled("jobFlow")) {
    redirect("/staffing");
  }

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect("/workspace");
  }

  if (session.authMethod === "QUICK_PIN") {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader
          title="Operations Board"
          subtitle="Password sign-in is required to open the Supervisor Operations Board."
          compact
        />
      </section>
    );
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);

  const department = await resolveStaffingOperationalDepartment({
    facilityId: session.facilityId,
    activeDepartmentId: deptNav.activeDepartmentId,
    feature: "jobFlow",
  });

  if (!department) {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader
          title="Operations Board"
          subtitle="No operational department is available for this facility."
          compact
        />
      </section>
    );
  }

  const query = searchParams ? await searchParams : undefined;
  const filterFloor = firstParam(query?.floor);
  const filterUnit = firstParam(query?.unit);
  const filterZone = firstParam(query?.zone);
  const filterEmployee = firstParam(query?.employee);

  let view;
  try {
    view = await loadSupervisorOperationsViewModel({
      session,
      facilityId: session.facilityId,
      departmentId: department.id,
      filters: {
        floor: filterFloor,
        unit: filterUnit,
        zone: filterZone,
        employee: filterEmployee,
      },
    });
  } catch (error) {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader title="Operations Board" subtitle={department.name} compact />
        <p className="text-sm text-zinc-600">
          {error instanceof Error ? error.message : "Unable to load Operations Board."}
        </p>
      </section>
    );
  }

  if (!view) {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader
          title="Operations Board"
          subtitle={`${department.name} Job Flow is not enabled.`}
          compact
        />
      </section>
    );
  }

  const canOpenBuilder = hasAtLeastRole(session.role, "MANAGER");
  const builderHref = `/admin/departments/${department.id}?tab=cycles`;

  const workPlansEnabled = isDepartmentWorkPlansEnabled(department.key);
  const oneOffUnits = workPlansEnabled
    ? await prisma.unit.findMany({
        where: {
          facilityId: session.facilityId,
          isActive: true,
          departmentResponsibilities: { some: { departmentId: department.id } },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 40,
      })
    : [];

  const showPlantRouting =
    department.key === "PLANT" &&
    isPlantOperationsEnabled() &&
    hasAtLeastRole(session.role, "MANAGER");

  let plantRouting: {
    routes: Array<{
      id: string;
      requestingDepartmentId: string;
      requestingDepartmentName: string;
      requestingDepartmentKey: string;
      responsibleDepartmentId: string;
      responsibleDepartmentName: string;
      responsibleDepartmentKey: string;
      isActive: boolean;
      sortOrder: number;
      note: string | null;
    }>;
    departments: Array<{ id: string; name: string; key: string }>;
  } | null = null;

  if (showPlantRouting) {
    try {
      const [routes, departments] = await Promise.all([
        listRoutesForFacility(session, session.facilityId, department.id),
        prisma.department.findMany({
          where: { facilityId: session.facilityId, isActive: true },
          select: { id: true, name: true, key: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        }),
      ]);
      plantRouting = {
        routes: routes.map((route) => ({
          id: route.id,
          requestingDepartmentId: route.requestingDepartmentId,
          requestingDepartmentName: route.requestingDepartment.name,
          requestingDepartmentKey: route.requestingDepartment.key,
          responsibleDepartmentId: route.responsibleDepartmentId,
          responsibleDepartmentName: route.responsibleDepartment.name,
          responsibleDepartmentKey: route.responsibleDepartment.key,
          isActive: route.isActive,
          sortOrder: route.sortOrder,
          note: route.note,
        })),
        departments,
      };
    } catch {
      plantRouting = null;
    }
  }

  const plantOperations = view.overlay.plant;

  return (
    <SupervisorOperationsBoardView
      view={view}
      canOpenBuilder={canOpenBuilder}
      builderHref={builderHref}
      overlay={
        <>
          {plantRouting ? (
            <PlantRequestRoutingPanel
              plantDepartmentId={view.identity.departmentId}
              routes={plantRouting.routes}
              departments={plantRouting.departments}
            />
          ) : null}

          {plantOperations ? (
            <PlantTriagePanel
              plantDepartmentId={view.identity.departmentId}
              requests={plantOperations.requests}
              technicians={plantOperations.technicians}
              summary={{
                newRequests: plantOperations.newRequests,
                untriaged: plantOperations.untriaged,
                urgent: plantOperations.urgent,
                openWorkOrders: plantOperations.openWorkOrders,
                inProgressWorkOrders: plantOperations.inProgressWorkOrders,
                waitingVendor: plantOperations.waitingVendor,
                waitingParts: plantOperations.waitingParts,
                overdueWorkOrders: plantOperations.overdueWorkOrders,
                unassignedWorkOrders: plantOperations.unassignedWorkOrders,
                outOfServiceAssets: plantOperations.outOfServiceAssets,
              }}
            />
          ) : null}

          {workPlansEnabled ? (
            <SupervisorWorkActionsPanel
              facilityId={session.facilityId}
              departmentId={department.id}
              units={oneOffUnits}
            />
          ) : null}
        </>
      }
    />
  );
}

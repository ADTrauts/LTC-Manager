import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { PmBuilderShell } from "@/components/plant-operations/pm-builder-shell";
import { PmPlanList } from "@/components/plant-operations/pm-plan-list";
import { getSession } from "@/lib/auth";
import { loadDepartmentAdminView } from "@/lib/department-administration/load-department-admin";
import { loadDepartmentBuilderContextSummary } from "@/lib/department-administration/builder-context-summary";
import { prisma } from "@/lib/prisma";
import {
  loadPlantPmBuilderDepartment,
  loadPmPlanList,
  type PmPlanListFilter,
} from "@/lib/preventive-maintenance/builder-load";

type PageProps = {
  params: Promise<{ departmentId: string }>;
  searchParams: Promise<{ filter?: string; asset?: string }>;
};

export default async function PreventiveMaintenanceListPage({ params, searchParams }: PageProps) {
  noStore();
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");

  const { departmentId } = await params;
  const query = await searchParams;
  const plantDepartment = await loadPlantPmBuilderDepartment(session, departmentId);
  if (!plantDepartment) notFound();

  const view = await loadDepartmentAdminView({
    facilityId: session.facilityId,
    departmentId,
    requestedProfileId: null,
  });
  if (!view || view.department.key !== "PLANT") notFound();

  const context = await loadDepartmentBuilderContextSummary(session, view.department.id);
  if (!context) notFound();

  const filter: PmPlanListFilter =
    query.filter === "published" || query.filter === "draft" || query.filter === "retired"
      ? query.filter
      : "all";

  const list = await loadPmPlanList(session, {
    facilityId: session.facilityId,
    departmentId: view.department.id,
    filter,
    assetQuery: query.asset ?? "",
  });
  const assetCount = await prisma.asset.count({
    where: { unit: { facilityId: session.facilityId } },
  });

  if (!list.authority.canView) {
    return (
      <PmBuilderShell
        departmentId={view.department.id}
        departmentName={view.department.name}
        departmentKey={view.department.key}
        locationCount={view.locationCoverage.total}
        context={context}
      >
        <p className="text-sm text-zinc-600">{list.authority.reason ?? "Insufficient authority."}</p>
      </PmBuilderShell>
    );
  }

  return (
    <PmBuilderShell
      departmentId={view.department.id}
      departmentName={view.department.name}
      departmentKey={view.department.key}
      locationCount={view.locationCoverage.total}
      context={context}
    >
      <PmPlanList
        departmentId={view.department.id}
        rows={list.rows}
        filter={filter}
        assetQuery={query.asset ?? ""}
        canCreate={list.authority.canDraft}
        assetCount={assetCount}
      />
    </PmBuilderShell>
  );
}

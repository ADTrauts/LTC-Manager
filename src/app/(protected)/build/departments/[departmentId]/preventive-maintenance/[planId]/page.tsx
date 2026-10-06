import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { PmBuilderShell } from "@/components/plant-operations/pm-builder-shell";
import { PmPlanEditor } from "@/components/plant-operations/pm-plan-editor";
import { getSession } from "@/lib/auth";
import { loadDepartmentAdminView } from "@/lib/department-administration/load-department-admin";
import { loadDepartmentBuilderContextSummary } from "@/lib/department-administration/builder-context-summary";
import { loadPlantPmBuilderDepartment, loadPmPlanEditor } from "@/lib/preventive-maintenance/builder-load";

type PageProps = {
  params: Promise<{ departmentId: string; planId: string }>;
};

export default async function PreventiveMaintenancePlanPage({ params }: PageProps) {
  noStore();
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");

  const { departmentId, planId } = await params;
  if (planId === "new") {
    redirect(`/build/departments/${departmentId}/preventive-maintenance/new`);
  }
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

  const loaded = await loadPmPlanEditor(session, {
    facilityId: session.facilityId,
    departmentId: view.department.id,
    planId,
  });
  if (!loaded) notFound();

  if (!loaded.authority.canView) {
    return (
      <PmBuilderShell
        departmentId={view.department.id}
        departmentName={view.department.name}
        departmentKey={view.department.key}
        locationCount={view.locationCoverage.total}
        context={context}
      >
        <p className="text-sm text-zinc-600">
          {loaded.authority.reason ?? "Insufficient authority."}
        </p>
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
      <PmPlanEditor
        departmentId={view.department.id}
        facilityToday={loaded.facilityToday}
        mode="edit"
        plan={loaded.plan}
        options={loaded.options}
        canDraft={loaded.authority.canDraft}
        canPublish={loaded.authority.canPublish}
        canRetire={loaded.authority.canRetire}
      />
    </PmBuilderShell>
  );
}

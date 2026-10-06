import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { PmBuilderShell } from "@/components/plant-operations/pm-builder-shell";
import { PmPlanEditor } from "@/components/plant-operations/pm-plan-editor";
import { getSession } from "@/lib/auth";
import { loadDepartmentAdminView } from "@/lib/department-administration/load-department-admin";
import { loadDepartmentBuilderContextSummary } from "@/lib/department-administration/builder-context-summary";
import { facilityCivilToday } from "@/lib/preventive-maintenance";
import {
  loadPlantPmBuilderDepartment,
  loadPmBuilderOptions,
} from "@/lib/preventive-maintenance/builder-load";
import { prisma } from "@/lib/prisma";
import { resolvePmPlanAuthority } from "@/lib/preventive-maintenance";

type PageProps = {
  params: Promise<{ departmentId: string }>;
};

export default async function NewPreventiveMaintenancePlanPage({ params }: PageProps) {
  noStore();
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");

  const { departmentId } = await params;
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

  const authority = await resolvePmPlanAuthority(
    session,
    session.facilityId,
    view.department.id,
  );
  if (!authority.canDraft) {
    return (
      <PmBuilderShell
        departmentId={view.department.id}
        departmentName={view.department.name}
        departmentKey={view.department.key}
        locationCount={view.locationCoverage.total}
        context={context}
      >
        <p className="text-sm text-zinc-600">
          {authority.reason ?? "You can view Preventive Maintenance but cannot create drafts."}
        </p>
      </PmBuilderShell>
    );
  }

  const facility = await prisma.facility.findFirst({
    where: { id: session.facilityId },
    select: { timezone: true },
  });
  const facilityToday = facilityCivilToday(facility?.timezone);
  const options = await loadPmBuilderOptions({
    facilityId: session.facilityId,
    departmentId: view.department.id,
  });

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
        facilityToday={facilityToday}
        mode="create"
        plan={null}
        options={options}
        canDraft={authority.canDraft}
        canPublish={authority.canPublish}
        canRetire={authority.canRetire}
      />
    </PmBuilderShell>
  );
}

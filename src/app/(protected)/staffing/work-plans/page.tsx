import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { BuildPageHeader } from "@/components/build/build-breadcrumb";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { GENERIC_WORK_AUTHORING_RETIRED, loadBuilderWorkPlans } from "@/lib/department-work";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import {
  isAnyStaffingOperationalFeatureEnabled,
  resolveStaffingOperationalDepartment,
} from "@/lib/department-operations";
import { cookies } from "next/headers";

/**
 * Generic Work Plan builder is retired (Phase 2B).
 * Existing plans remain readable for Job Flow compatibility until Phase 2C.
 */
export default async function WorkPlanBuilderPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");

  if (!hasAtLeastRole(session.role, "MANAGER")) {
    redirect("/workspace");
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  if (!isAnyStaffingOperationalFeatureEnabled("workPlans", deptNav.activeOperationalDepartmentKey)) {
    redirect("/staffing");
  }
  const department = await resolveStaffingOperationalDepartment({
    facilityId: session.facilityId,
    activeDepartmentId: deptNav.activeDepartmentId,
    feature: "workPlans",
  });

  let existingNames: string[] = [];
  if (department) {
    try {
      const builder = await loadBuilderWorkPlans({
        session,
        facilityId: session.facilityId,
        departmentId: department.id,
      });
      existingNames = builder.plans.map((plan) => `${plan.name} (${plan.status})`);
    } catch {
      existingNames = [];
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-4" data-testid="work-plan-builder-retired">
      <BuildPageHeader title="Work (retired)" subtitle={GENERIC_WORK_AUTHORING_RETIRED} />
      <p className="text-sm text-zinc-600">
        Configure Operating Rhythm, Records, Coverage, and Plant Work Orders or Preventive
        Maintenance in Department Builder instead.
      </p>
      <p className="text-sm text-zinc-600">
        <Link
          href="/build/departments"
          className="font-medium underline underline-offset-2"
        >
          Open Department Builder
        </Link>
      </p>
      {existingNames.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Existing plans (read-only)</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Published plans may still appear in Job Flow until that composition is rewired.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
            {existingNames.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

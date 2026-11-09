import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { PageHeader, StatusBadge } from "@/components/design-system";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import {
  isAnyStaffingOperationalFeatureEnabled,
  resolveStaffingOperationalDepartment,
} from "@/lib/department-operations";
import { GENERIC_WORK_AUTHORING_RETIRED, loadWorkPlanDetail } from "@/lib/department-work";

type Props = {
  params: Promise<{ workPlanId: string }>;
};

/** Read-only Work Plan detail. Authoring retired in Phase 2B. */
export default async function WorkPlanDetailPage({ params }: Props) {
  noStore();
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "MANAGER")) redirect("/workspace");

  const { workPlanId } = await params;
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
  if (!department) notFound();

  let detail;
  try {
    detail = await loadWorkPlanDetail({
      session,
      facilityId: session.facilityId,
      departmentId: department.id,
      workPlanId,
    });
  } catch {
    notFound();
  }

  const plan = detail.plan;

  return (
    <section className="mx-auto max-w-4xl space-y-4" data-testid="work-plan-detail-retired">
      <PageHeader
        title={plan.name}
        subtitle={`${department.name} · ${plan.status} · v${plan.version} · ${plan.stableKey}`}
        compact
        actions={
          <Link href="/staffing/work-plans" className="text-sm underline-offset-2 hover:underline">
            Work (retired)
          </Link>
        }
      />
      <p className="text-sm text-zinc-600" data-testid="work-plan-detail-retired-note">
        {GENERIC_WORK_AUTHORING_RETIRED}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          variant={
            plan.status === "PUBLISHED"
              ? "success"
              : plan.status === "DRAFT"
                ? "neutral"
                : "warning"
          }
        >
          {plan.status}
        </StatusBadge>
        <span className="text-sm text-zinc-500">{plan.items.length} steps · read-only</span>
      </div>
      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
        {plan.items.map((item) => (
          <li key={item.id} className="px-4 py-3 text-sm">
            <p className="font-medium text-zinc-900">{item.label}</p>
            {item.instructions ? (
              <p className="mt-1 text-zinc-600">{item.instructions}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

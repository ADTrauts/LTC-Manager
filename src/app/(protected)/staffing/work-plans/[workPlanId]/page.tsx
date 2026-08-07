import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { PageHeader, StatusBadge } from "@/components/design-system";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { loadWorkPlanDetail } from "@/lib/department-work";
import { isDietaryWorkPlansEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ workPlanId: string }>;
};

export default async function WorkPlanDetailPage({ params }: Props) {
  noStore();
  if (!isDietaryWorkPlansEnabled()) redirect("/staffing");

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "MANAGER")) redirect("/workspace");

  const { workPlanId } = await params;
  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const dietary =
    (deptNav.activeDepartmentId
      ? await prisma.department.findFirst({
          where: {
            id: deptNav.activeDepartmentId,
            facilityId: session.facilityId,
            key: "DIETARY",
            isActive: true,
          },
          select: { id: true },
        })
      : null) ??
    (await prisma.department.findFirst({
      where: { facilityId: session.facilityId, key: "DIETARY", isActive: true },
      select: { id: true },
    }));
  if (!dietary) notFound();

  let detail;
  try {
    detail = await loadWorkPlanDetail({
      session,
      facilityId: session.facilityId,
      departmentId: dietary.id,
      workPlanId,
    });
  } catch {
    notFound();
  }

  const plan = detail.plan;

  return (
    <section className="mx-auto max-w-4xl space-y-4" data-testid="work-plan-detail">
      <PageHeader
        title={plan.name}
        subtitle={`${plan.status} · v${plan.version} · ${plan.stableKey}`}
        compact
        actions={
          <Link href="/staffing/work-plans" className="text-sm underline-offset-2 hover:underline">
            Back to Work Plans
          </Link>
        }
      />
      <StatusBadge variant={plan.status === "PUBLISHED" ? "success" : "neutral"}>
        {plan.status}
      </StatusBadge>
      {plan.description ? <p className="text-sm text-zinc-700">{plan.description}</p> : null}
      <ul className="divide-y rounded-md border bg-white" data-testid="work-plan-detail-items">
        {plan.items.map((item) => (
          <li key={item.id} className="px-3 py-2 text-sm">
            <div className="font-medium">{item.label}</div>
            <div className="text-xs text-zinc-600">
              {item.itemKey} · {item.completionMode} · {item.scheduleKind}
              {item.procedureTitleSnapshot ? ` · Procedure: ${item.procedureTitleSnapshot}` : ""}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

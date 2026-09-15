import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { RunLogRequirementList } from "@/components/canonical-logs/run-log-requirement-list";
import { PageHeader } from "@/components/design-system";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { loadFacilityRunLogRequirements } from "@/lib/canonical-logs/load-run-requirements";
import {
  isAnyStaffingOperationalFeatureEnabled,
  resolveStaffingOperationalDepartment,
} from "@/lib/department-operations";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

export default async function CanonicalRunLogsPage() {
  noStore();

  if (!isCanonicalLogsEnabled()) {
    redirect(isAnyStaffingOperationalFeatureEnabled("evidence") ? "/staffing/log-book" : "/logs");
  }

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "STAFF")) redirect("/workspace");

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);

  // Prefer active department; fall back to Dietary operational department helper when available.
  let departmentId = deptNav.activeDepartmentId;
  if (!departmentId) {
    const dept = await resolveStaffingOperationalDepartment({
      facilityId: session.facilityId,
      activeDepartmentId: null,
      feature: "evidence",
    }).catch(() => null);
    departmentId = dept?.id ?? null;
  }
  if (!departmentId) {
    const fallback = await prisma.department.findFirst({
      where: { facilityId: session.facilityId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    });
    departmentId = fallback?.id ?? null;
  }

  if (!departmentId) {
    return (
      <section className="mx-auto max-w-3xl space-y-3">
        <PageHeader title="Logs" subtitle="No department available for Logs." compact />
      </section>
    );
  }

  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId: session.facilityId },
    select: { id: true, name: true },
  });

  const bundle = await loadFacilityRunLogRequirements({
    client: prisma,
    session,
    facilityId: session.facilityId,
    departmentId,
  });

  const isManager = hasAtLeastRole(session.role, "MANAGER");

  return (
    <section className="mx-auto max-w-3xl space-y-4" data-testid="canonical-run-logs-page">
      <PageHeader
        title="Logs"
        subtitle={`${department?.name ?? "Department"} · ${bundle.operationalDateKey}`}
        compact
        actions={
          <div className="flex flex-wrap gap-3 text-sm">
            {hasAtLeastRole(session.role, "SUPERVISOR") && session.authMethod !== "QUICK_PIN" ? (
              <Link href="/staffing/log-book" className="underline-offset-2 hover:underline">
                Log Book
              </Link>
            ) : null}
            {hasAtLeastRole(session.role, "MANAGER") ? (
              <Link href="/build/logs" className="underline-offset-2 hover:underline">
                Catalog
              </Link>
            ) : null}
          </div>
        }
      />
      <RunLogRequirementList
        requirements={bundle.requirements}
        adHocAttachments={bundle.adHocAttachments}
        includeNeedsSetup={isManager}
        isManager={isManager}
      />
    </section>
  );
}

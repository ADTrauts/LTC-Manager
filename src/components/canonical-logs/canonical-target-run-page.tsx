import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { PageHeader } from "@/components/design-system";
import { RunTargetLogsSection } from "@/components/canonical-logs/run-target-logs-section";
import { hasAtLeastRole } from "@/lib/access";
import { cookies } from "next/headers";

import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import {
  loadTargetRunLogs,
  type RunTargetRef,
} from "@/lib/canonical-logs/load-target-run-logs";
import { isAnyStaffingOperationalFeatureEnabled } from "@/lib/department-operations";
import { prisma } from "@/lib/prisma";

type Props = {
  target: RunTargetRef;
  subtitle: string;
  testId: string;
};

export async function CanonicalTargetRunLogsPage({ target, subtitle, testId }: Props) {
  noStore();
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "STAFF")) redirect("/workspace");
  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  if (!isCanonicalLogsEnabled()) {
    redirect(
      isAnyStaffingOperationalFeatureEnabled("evidence", deptNav.activeOperationalDepartmentKey)
        ? "/staffing/log-book"
        : "/logs",
    );
  }

  const view = await loadTargetRunLogs({
    client: prisma,
    session,
    facilityId: session.facilityId,
    target,
  });
  if (!view) notFound();

  const isManager =
    hasAtLeastRole(session.role, "MANAGER") && session.authMethod !== "QUICK_PIN";

  return (
    <section className="mx-auto max-w-3xl space-y-4" data-testid={testId}>
      <PageHeader title="Logs" subtitle={`${subtitle} · ${view.operationalDateKey}`} compact />
      <RunTargetLogsSection view={view} isManager={isManager} />
    </section>
  );
}

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardScreen } from "@/components/dashboard/dashboard-screen";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { ACTIVE_DEPARTMENT_COOKIE } from "@/lib/department-nav";
import { dashboardFaultCardId } from "@/lib/dashboard/fault";
import { resolveDashboardViewer } from "@/lib/dashboard/viewer/resolve";
import { isDashboardV2Enabled } from "@/lib/feature-flags";
import { resolveDefaultHomePath } from "@/lib/nav-zones";

type DashboardPageProps = {
  searchParams?: Promise<{
    onboarding?: string | string[] | undefined;
    scope?: string | string[] | undefined;
    fault?: string | string[] | undefined;
  }>;
};

/**
 * Flag off: `/dashboard` still sends each role to today's home.
 * Flag on: Supervisor and above see the Dashboard. The flag stays off until production approval.
 */
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const query = searchParams ? await searchParams : {};
  const onboardingComplete = typeof query.onboarding === "string" && query.onboarding === "complete";
  const scopeParam = typeof query.scope === "string" ? query.scope : undefined;
  const faultCardId = dashboardFaultCardId(typeof query.fault === "string" ? query.fault : undefined);
  const destination = resolveDefaultHomePath({
    authKind: session.authKind,
    role: session.role,
    activeUnitId: session.activeUnitId,
  });

  if (!isDashboardV2Enabled()) {
    redirect(onboardingComplete ? `${destination}?onboarding=complete` : destination);
  }
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect(destination);
  }

  const cookieStore = await cookies();
  const resolution = await resolveDashboardViewer(session, {
    scopeParam,
    cookieDepartmentId: cookieStore.get(ACTIVE_DEPARTMENT_COOKIE)?.value,
  });
  if (resolution.kind !== "viewer" || !resolution.viewer.scope) {
    return (
      <section className="mx-auto max-w-3xl" data-testid="dashboard-v2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-sm text-zinc-600">Your Dashboard needs a Department.</p>
      </section>
    );
  }

  return (
    <DashboardScreen
      viewer={resolution.viewer}
      onboardingComplete={onboardingComplete}
      faultCardId={faultCardId}
    />
  );
}

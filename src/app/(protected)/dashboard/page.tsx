import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { resolveDefaultHomePath } from "@/lib/nav-zones";

type RetiredOperationsCenterPageProps = {
  searchParams?: Promise<{
    onboarding?: string | string[] | undefined;
  }>;
};

/**
 * `/dashboard` (legacy Operations Center) is RETIRED as a RUN destination.
 *
 * See docs/product/LTC_MANAGER_RUN_SURFACE_RATIONALIZATION_2026-08-09.md and the Legacy Surface
 * Register. The canonical RUN information architecture is:
 *   Dashboard      = /workspace  (manager/GM overview)
 *   Today's Work   = /today      (current-day execution)
 *   Locations      = /units      (place-based operational view)
 *
 * Bookmarks and deep links land on the caller's canonical RUN home instead of a dead route:
 * managers/GMs reach the Dashboard (`/workspace`), supervisors reach Today's Work (`/today`), and
 * frontline sessions reach their own operational home. Authorization is unchanged — every landing
 * route is independently gated by the platform route registry.
 */
export default async function RetiredOperationsCenterPage({
  searchParams,
}: RetiredOperationsCenterPageProps) {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const query = searchParams ? await searchParams : {};
  const onboardingComplete =
    typeof query.onboarding === "string" && query.onboarding === "complete";

  const destination = resolveDefaultHomePath({
    authKind: session.authKind,
    role: session.role,
    activeUnitId: session.activeUnitId,
  });

  // Preserve the post-onboarding launch checklist hand-off to the canonical Dashboard.
  redirect(onboardingComplete ? `${destination}?onboarding=complete` : destination);
}

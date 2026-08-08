import Link from "next/link";
import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/design-system/page-header";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { buildHubCards } from "@/lib/build-hub";
import { resolveNavIcon } from "@/lib/design-system";
import { filterNavItemsForDepartmentScope } from "@/lib/department-nav";
import {
  isDietaryOperationalEvidenceEnabled,
  isDietaryWorkPlansEnabled,
  isTodaysWorkEnabled,
} from "@/lib/feature-flags";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { groupNavItemsByMode, PRODUCT_MODE_TAGLINES } from "@/lib/product-mode";
import { platformNavItemsForRole } from "@/lib/route-registry";

/**
 * BUILD hub — the dedicated landing page for the Build product mode.
 *
 * It composes the same role/department-filtered navigation the shell computes, keeps only the BUILD
 * group, and presents each reachable configuration surface as a card. Authorization is unchanged:
 * the proxy already enforces the SUPERVISOR floor via the platform route registry, and the page
 * guards defensively. Frontline (STAFF / Quick PIN) sessions never reach here — Run only.
 */
export default async function BuildHubPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect(
      resolveDefaultHomePath({
        authKind: session.authKind,
        role: session.role,
        activeUnitId: session.activeUnitId,
      }),
    );
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);

  const rawNavItems = platformNavItemsForRole(session.role, {
    todaysWorkEnabled: isTodaysWorkEnabled(),
    dietaryOperationalEvidenceEnabled: isDietaryOperationalEvidenceEnabled(),
    dietaryWorkPlansEnabled: isDietaryWorkPlansEnabled(),
  });
  const navItems = filterNavItemsForDepartmentScope(rawNavItems, {
    showAllDepartmentNav: deptNav.showAllDepartmentNav,
    activeOperationalDepartmentKey: deptNav.activeOperationalDepartmentKey,
  });
  const buildGroup = groupNavItemsByMode(navItems).find((group) => group.mode === "BUILD");
  const cards = buildHubCards(buildGroup?.items ?? []);

  return (
    <div className="mx-auto max-w-3xl space-y-8" data-testid="build-hub">
      <PageHeader
        icon="operationalMode"
        title="Build"
        subtitle={`${PRODUCT_MODE_TAGLINES.BUILD} — set up how your operation works, then switch to Run to operate it.`}
        compact
      />

      {cards.length === 0 ? (
        <section
          className="rounded-xl border border-zinc-200 bg-zinc-50 p-6"
          data-testid="build-hub-empty"
        >
          <h2 className="text-lg font-semibold text-zinc-900">No Build tools available</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Your role and active department don&rsquo;t include configuration surfaces right now.
          </p>
        </section>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="build-hub-cards">
          {cards.map((card) => {
            const Icon = resolveNavIcon(card.href);
            return (
              <li key={card.href}>
                <Link
                  href={card.href}
                  data-testid="build-hub-card"
                  data-href={card.href}
                  className="flex h-full flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                >
                  <span className="flex items-center gap-2">
                    {Icon ? <Icon className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden /> : null}
                    <span className="text-sm font-semibold text-zinc-900">{card.label}</span>
                  </span>
                  <span className="text-sm text-zinc-600">{card.description}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

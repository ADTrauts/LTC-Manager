import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { assertFacilityAdministratorPage } from "@/lib/facility-admin-guard";
import { isTodaysWorkEnabled } from "@/lib/feature-flags";
import { buildAccessMatrix } from "@/lib/route-registry";

import { AccessMatrix } from "./access-matrix";

/**
 * Read-only Access Matrix.
 *
 * Route policy is platform-owned and lives in `src/lib/route-registry/platform-routes.ts`. This page
 * renders that policy; it holds no form, no Server Action, and no writable state. See
 * `docs/architecture/ADR_PLATFORM_OWNED_ROUTE_AUTHORIZATION_2026-08-04.md`.
 */
export default async function AdminPermissionsPage() {
  await assertFacilityAdministratorPage();

  const matrix = buildAccessMatrix({ todaysWorkEnabled: isTodaysWorkEnabled() });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AdminPageHeader
        title="Roles & Permissions"
        trail={[{ label: "Roles & Permissions" }]}
        subtitle="Review which product areas each platform role can reach. Role capabilities are platform-managed."
      />

      <AccessMatrix groups={matrix.pageGroups} roles={matrix.roles} />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";

import { isHarborOwnerSession, requireHarborStaff } from "@/lib/harbor-console/auth";
import { loadHarborOrganizationProfile } from "@/lib/harbor-console/queries";
import { organizationDisplayLabel } from "@/lib/organization-membership/types";
import { prisma } from "@/lib/prisma";

export default async function HarborOrganizationProfilePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const session = await requireHarborStaff();
  const { organizationId } = await params;
  const organization = await loadHarborOrganizationProfile(prisma, organizationId);
  if (!organization) notFound();

  const query = new URLSearchParams({ organizationId: organization.id }).toString();
  const showPartnerWorkflow = isHarborOwnerSession(session) && organization.isActive && organization.facilities.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link href="/console/customers" className="text-sm text-[var(--text-secondary)] underline underline-offset-2">
          Customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{organizationDisplayLabel(organization)}</h1>
      </header>

      <section aria-labelledby="organization-identity" className="rounded-md border border-[var(--border)] bg-white p-4">
        <h2 id="organization-identity" className="text-sm font-semibold">Organization identity</h2>
        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">Name</dt>
            <dd className="mt-0.5 break-words">{organization.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">Organization ID</dt>
            <dd className="mt-0.5 break-all font-mono text-xs">{organization.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">Status</dt>
            <dd className="mt-0.5">{organization.isActive ? "Active" : "Inactive"}</dd>
          </div>
        </dl>
        <nav aria-label="Organization workflows" className="mt-3 flex flex-wrap gap-x-5 text-sm">
          <Link href={`/console/organization-claims?${query}`} className="inline-flex min-h-11 items-center underline">
            View Organization claims
          </Link>
          {showPartnerWorkflow ? (
            <Link href={`/console/partners?${query}`} className="inline-flex min-h-11 items-center underline">
              Open partner workflow
            </Link>
          ) : null}
        </nav>
      </section>

      <section aria-labelledby="owned-facilities" className="rounded-md border border-[var(--border)] bg-white p-4">
        <h2 id="owned-facilities" className="text-sm font-semibold">Owned Facilities</h2>
        {organization.facilities.length > 0 ? (
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {organization.facilities.map((facility) => (
              <li key={facility.id} className="py-2">
                <Link
                  href={`/console/customers/${facility.id}`}
                  className="inline-flex min-h-11 flex-col justify-center gap-0.5 text-sm"
                  prefetch={false}
                >
                  <span className="font-medium underline underline-offset-2">{facility.displayName}</span>
                  <span className="break-all font-mono text-xs text-[var(--text-secondary)]">{facility.id}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">This Organization has no owned Facilities.</p>
        )}
      </section>
    </div>
  );
}

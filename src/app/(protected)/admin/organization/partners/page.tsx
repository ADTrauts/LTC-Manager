import Link from "next/link";

import { CreateFacilityPartnerForm } from "@/components/facility-partners/create-facility-partner-form";
import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { assertFacilityAdministratorPage } from "@/lib/facility-admin-guard";
import {
  getFacilityPartners,
  lifecycleStateLabel,
  partnerOrganizationLabel,
} from "@/lib/partner-access";
import { prisma } from "@/lib/prisma";

function formatPartnerSince(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default async function AdminOrganizationPartnersPage() {
  const session = await assertFacilityAdministratorPage();

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: {
      id: true,
      displayName: true,
      organizationId: true,
      organization: { select: { id: true, name: true, displayName: true } },
    },
  });
  if (!facility) {
    return null;
  }

  const partners = await getFacilityPartners(prisma, { facilityId: facility.id });
  const facilityOrgLabel =
    facility.organization.displayName?.trim() || facility.organization.name;

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="admin-organization-partners-page">
      <AdminPageHeader
        title="External Partners"
        subtitle="Facility-level partnerships with external Organizations and explicit Department authorization scope. Partner users are not yet granted access by this relationship."
        trail={[
          { label: "Organization Settings", href: "/admin/organization" },
          { label: "External Partners" },
        ]}
      />

      <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Partner relationship + Department scope does not grant any user Facility access in Phase
        2A. User entry remains the internal authorization path only.
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">Partners</h2>
        {partners.length === 0 ? (
          <p className="text-sm text-zinc-500">No external partner relationships yet.</p>
        ) : (
          <ul className="space-y-3">
            {partners.map((partner) => (
              <li
                key={partner.id}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-4"
                data-testid={`partner-card-${partner.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-zinc-900">
                      {partnerOrganizationLabel(partner.organization)}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-600">
                      {lifecycleStateLabel(partner.lifecycleState)}
                    </p>
                  </div>
                  <Link
                    href={`/admin/organization/partners/${partner.id}`}
                    className="text-sm font-semibold text-zinc-900 underline-offset-2 hover:underline"
                  >
                    Manage →
                  </Link>
                </div>
                <dl className="mt-3 space-y-1 text-sm text-zinc-700">
                  <div>
                    <dt className="inline font-medium text-zinc-900">Authorized Departments </dt>
                    <dd className="inline">
                      {partner.currentDepartmentScopes.length > 0
                        ? partner.currentDepartmentScopes
                            .map((scope) => scope.departmentName)
                            .join(", ")
                        : "None currently authorized"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-zinc-900">Partner since </dt>
                    <dd className="inline">{formatPartnerSince(partner.createdAt)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">Establish external partner</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Creates a Facility ↔ Organization partnership identity. Activation and Department scope
          are separate explicit steps unless you activate now.
        </p>
        <div className="mt-3">
          <CreateFacilityPartnerForm
            facilityOrganizationId={facility.organizationId}
            facilityOrganizationLabel={facilityOrgLabel}
          />
        </div>
      </section>
    </div>
  );
}

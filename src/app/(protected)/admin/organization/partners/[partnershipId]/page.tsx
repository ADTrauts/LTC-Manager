import Link from "next/link";
import { notFound } from "next/navigation";

import { ManageFacilityPartnerActions } from "@/components/facility-partners/manage-facility-partner-actions";
import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { loadCustomerOperableDepartments } from "@/lib/department-products";
import { assertFacilityAdministratorPage } from "@/lib/facility-admin-guard";
import {
  FacilityPartnerError,
  getFacilityPartner,
  lifecycleStateLabel,
  partnerOrganizationLabel,
  suggestDepartmentsFromCurrentOperators,
} from "@/lib/partner-access";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ partnershipId: string }>;
};

function formatTimestamp(date: Date | null | undefined): string {
  if (!date) return "Open";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export default async function AdminOrganizationPartnerDetailPage({ params }: PageProps) {
  const session = await assertFacilityAdministratorPage();
  const { partnershipId } = await params;

  let partner;
  try {
    partner = await getFacilityPartner(prisma, {
      partnershipId,
      facilityId: session.facilityId,
    });
  } catch (error) {
    if (error instanceof FacilityPartnerError && error.code === "PARTNERSHIP_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const [operable, suggestions] = await Promise.all([
    loadCustomerOperableDepartments(prisma, session.facilityId),
    suggestDepartmentsFromCurrentOperators(prisma, {
      facilityId: session.facilityId,
      organizationId: partner.organizationId,
    }),
  ]);

  const operableOptions = operable.map((row) => ({ id: row.id, name: row.name }));
  const suggestedOptions = suggestions.map((row) => ({ id: row.id, name: row.name }));

  return (
    <div
      className="mx-auto max-w-3xl space-y-6"
      data-testid="admin-organization-partner-detail-page"
    >
      <AdminPageHeader
        title={partnerOrganizationLabel(partner.organization)}
        subtitle="External partner governance for this Facility. Partner users are not yet granted access by this relationship."
        trail={[
          { label: "Organization Settings", href: "/admin/organization" },
          { label: "External Partners", href: "/admin/organization/partners" },
          { label: partnerOrganizationLabel(partner.organization) },
        ]}
      />

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">Partnership</h2>
        <dl className="mt-2 space-y-1 text-sm text-zinc-700">
          <div>
            <dt className="inline font-medium text-zinc-900">Organization </dt>
            <dd className="inline">{partnerOrganizationLabel(partner.organization)}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-zinc-900">State </dt>
            <dd className="inline" data-testid="partner-lifecycle-state">
              {lifecycleStateLabel(partner.lifecycleState)}
            </dd>
          </div>
          <div>
            <dt className="inline font-medium text-zinc-900">Current authorization period </dt>
            <dd className="inline">
              {partner.currentAccessPeriod
                ? `${formatTimestamp(partner.currentAccessPeriod.startsAt)} → ${formatTimestamp(partner.currentAccessPeriod.endsAt)}`
                : "None"}
            </dd>
          </div>
          {partner.notes ? (
            <div>
              <dt className="inline font-medium text-zinc-900">Notes </dt>
              <dd className="inline">{partner.notes}</dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-3 text-xs text-zinc-500">
          Partner users are not yet granted access by this relationship.
        </p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <ManageFacilityPartnerActions
          partnershipId={partner.id}
          lifecycleState={partner.lifecycleState}
          currentScopeDepartmentIds={partner.currentDepartmentScopes.map((s) => s.departmentId)}
          operableDepartments={operableOptions}
          suggestedDepartments={suggestedOptions}
        />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">Authorization period history</h2>
        {partner.accessPeriods.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">No authorization periods yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100">
            {partner.accessPeriods.map((period) => (
              <li key={period.id} className="py-2 text-sm text-zinc-700">
                {formatTimestamp(period.startsAt)} → {formatTimestamp(period.endsAt)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">Department scope history</h2>
        {partner.departmentScopes.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">No Department scopes yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100">
            {partner.departmentScopes.map((scope) => (
              <li key={scope.id} className="py-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">{scope.departmentName}</span>
                <span className="mx-1.5 text-zinc-300">·</span>
                {formatTimestamp(scope.startsAt)} → {formatTimestamp(scope.endsAt)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm">
        <Link
          href="/admin/organization/partners"
          className="font-medium text-zinc-900 underline-offset-2 hover:underline"
        >
          ← Back to External Partners
        </Link>
      </p>
    </div>
  );
}

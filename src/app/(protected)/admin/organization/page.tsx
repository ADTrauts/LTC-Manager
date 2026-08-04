import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { ROLE_PRIORITY, type AppRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { getFacilityForSession } from "@/lib/facility-context";
import { loadOrganizationContextForSessionFacility } from "@/lib/organization";
import { prisma } from "@/lib/prisma";

import { BindDeviceForm } from "@/components/bind-device-form";

import { FacilitySettingsForm } from "./facility-settings-form";
import { OrganizationSettingsForm } from "./organization-settings-form";
import { UnionHandbookSettings } from "./union-handbook-settings";

export default async function AdminOrganizationPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (ROLE_PRIORITY[session.role as AppRole] < ROLE_PRIORITY.FACILITY_ADMINISTRATOR) {
    redirect("/dashboard");
  }

  const facility =
    (await getFacilityForSession()) ??
    (await prisma.facility.findUnique({
      where: { id: session.facilityId },
      select: {
        id: true,
        displayName: true,
        managementCompanyName: true,
        brandColor: true,
        timezone: true,
        organizationId: true,
        organization: {
          select: {
            id: true,
            name: true,
            legalName: true,
            displayName: true,
            organizationType: true,
            isActive: true,
          },
        },
        unionHandbookPdfPath: true,
        unionHandbookOriginalFilename: true,
        unionHandbookUploadedAt: true,
        unionHandbookEffectiveDate: true,
      },
    }));

  if (!facility) {
    redirect("/dashboard");
  }

  const organizationContext = await loadOrganizationContextForSessionFacility(facility.id);
  const organization = facility.organization ?? null;

  const units = await prisma.unit.findMany({
    where: { facilityId: facility.id, isActive: true },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <AdminPageHeader
        title="Organization Settings"
        trail={[{ label: "Organization Settings" }]}
        subtitle="Organization is the parent business entity; Facility remains the login and operational scope. Only Facility Administrators can edit these settings."
        below={
          <div
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm sm:px-5"
            data-testid="org-facilities-secondary-nav"
          >
            <p className="text-sm font-medium text-zinc-900">Facilities &amp; User Access</p>
            <p className="mt-0.5 text-sm text-zinc-600">
              Optional multi-site facility visibility and explicit user facility grants. Not required for
              normal single-facility operation.
            </p>
            <Link
              href="/admin/organization/facilities"
              className="mt-2 inline-flex text-sm font-semibold text-zinc-900 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              Open Facilities &amp; User Access →
            </Link>
          </div>
        }
      />

      {organization ? (
        <OrganizationSettingsForm
          organization={{
            id: organization.id,
            name: organization.name,
            legalName: organization.legalName,
            displayName: organization.displayName,
            organizationType: organization.organizationType,
          }}
        />
      ) : (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Organization relation is missing for this facility. Run the Wave 11 migration/backfill.
        </section>
      )}

      <FacilitySettingsForm
        facility={{
          id: facility.id,
          displayName: facility.displayName,
          managementCompanyName: facility.managementCompanyName,
          brandColor: facility.brandColor,
          timezone: facility.timezone ?? "America/New_York",
          organizationName:
            organizationContext?.organizationName ??
            organization?.displayName ??
            organization?.name ??
            "Unassigned",
        }}
      />
      <UnionHandbookSettings
        hasPdf={Boolean(facility.unionHandbookPdfPath)}
        originalFilename={facility.unionHandbookOriginalFilename}
        uploadedAtIso={facility.unionHandbookUploadedAt?.toISOString() ?? null}
        effectiveDateIso={
          facility.unionHandbookEffectiveDate
            ? facility.unionHandbookEffectiveDate.toISOString().slice(0, 10)
            : null
        }
      />
      <BindDeviceForm units={units} />
    </div>
  );
}

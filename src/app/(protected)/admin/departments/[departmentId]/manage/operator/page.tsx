import Link from "next/link";
import { notFound } from "next/navigation";

import { cancelFutureDepartmentOperatorAction } from "@/app/(protected)/admin/departments/[departmentId]/operator-actions";
import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { ManageOperatingOrganizationForm } from "@/components/department-operators/manage-operating-organization-form";
import {
  ADMIN_DEPARTMENTS_HREF,
  adminDepartmentManageHref,
} from "@/lib/department-administration";
import { loadCustomerOperableDepartments } from "@/lib/department-products";
import {
  loadCurrentDepartmentOperator,
  loadDepartmentOperatorHistory,
  organizationDisplayLabel,
} from "@/lib/department-operators";
import { assertFacilityAdministratorPage } from "@/lib/facility-admin-guard";
import {
  getFacilityServiceDate,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ departmentId: string }>;
};

export default async function ManageDepartmentOperatorPage({ params }: PageProps) {
  const session = await assertFacilityAdministratorPage();
  const { departmentId } = await params;

  const operable = await loadCustomerOperableDepartments(prisma, session.facilityId);
  if (!operable.some((row) => row.id === departmentId)) {
    notFound();
  }

  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId: session.facilityId },
    select: {
      id: true,
      name: true,
      facility: {
        select: {
          timezone: true,
          organizationId: true,
          organization: {
            select: { id: true, name: true, displayName: true },
          },
        },
      },
    },
  });
  if (!department) notFound();

  const [current, history] = await Promise.all([
    loadCurrentDepartmentOperator(prisma, {
      departmentId,
      facilityId: session.facilityId,
    }),
    loadDepartmentOperatorHistory(prisma, {
      departmentId,
      facilityId: session.facilityId,
    }),
  ]);

  const todayKey = toServiceDateKey(
    getFacilityServiceDate(department.facility.timezone, new Date()),
  );
  const facilityOrgLabel = organizationDisplayLabel(department.facility.organization);
  const futureScheduled = history.filter(
    (row) => toServiceDateKey(row.effectiveFrom) > todayKey,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="manage-department-operator-page">
      <AdminPageHeader
        title="Operating organization"
        subtitle={`${department.name} — who has primary operating responsibility for this department.`}
        trail={[
          { label: "Departments", href: ADMIN_DEPARTMENTS_HREF },
          { label: department.name, href: adminDepartmentManageHref(department.id) },
          { label: "Operating organization" },
        ]}
      />

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">Current operator</h2>
        {current ? (
          <p className="mt-1 text-sm text-zinc-800" data-testid="current-operator-summary">
            {organizationDisplayLabel(current.relationship.organization)}
            <span className="mx-1.5 text-zinc-300">·</span>
            {current.operatingModel === "FACILITY_OPERATED" ? "Facility operated" : "Contracted"}
          </p>
        ) : (
          <p className="mt-1 text-sm text-amber-800">No current operator on today’s date.</p>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          Operating a department does not grant that Organization’s users access to this facility.
        </p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">Assign or schedule</h2>
        <div className="mt-3">
          <ManageOperatingOrganizationForm
            departmentId={department.id}
            facilityOrganizationId={department.facility.organizationId}
            facilityOrganizationLabel={facilityOrgLabel}
            defaultEffectiveFromKey={todayKey}
            currentOrganizationId={current?.relationship.organizationId ?? null}
            currentOrganizationLabel={
              current ? organizationDisplayLabel(current.relationship.organization) : null
            }
          />
        </div>
      </section>

      {futureScheduled.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Scheduled changes</h2>
          <ul className="mt-2 space-y-3">
            {futureScheduled.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-2 border-t border-zinc-100 pt-3 first:border-t-0 first:pt-0"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {organizationDisplayLabel(row.organization)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Effective {toServiceDateKey(row.effectiveFrom)}
                    {row.effectiveTo ? ` → ${toServiceDateKey(row.effectiveTo)}` : " → open"}
                  </p>
                </div>
                <form
                  action={async (formData) => {
                    "use server";
                    const result = await cancelFutureDepartmentOperatorAction(formData);
                    if (!result.ok) {
                      throw new Error(result.message);
                    }
                  }}
                >
                  <input type="hidden" name="departmentId" value={department.id} />
                  <input type="hidden" name="relationshipId" value={row.id} />
                  <button
                    type="submit"
                    className="text-xs font-medium text-zinc-700 underline underline-offset-2"
                    data-testid={`cancel-future-operator-${row.id}`}
                  >
                    Cancel
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">History</h2>
        {history.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">No operator relationships yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100">
            {history.map((row) => (
              <li key={row.id} className="py-2">
                <p className="text-sm font-medium text-zinc-900">
                  {organizationDisplayLabel(row.organization)}
                </p>
                <p className="text-xs text-zinc-500">
                  {toServiceDateKey(row.effectiveFrom)}
                  {" → "}
                  {row.effectiveTo ? toServiceDateKey(row.effectiveTo) : "Current / open"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p>
        <Link
          href={adminDepartmentManageHref(department.id)}
          className="text-sm font-medium text-zinc-700 underline underline-offset-2"
        >
          ← Back to department
        </Link>
      </p>
    </div>
  );
}

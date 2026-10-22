import { redirect } from "next/navigation";

import { VendorPinForm } from "@/app/partner/people/pin-form";
import { getPartnerFacilitySession } from "@/lib/auth";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import { listVendorDepartmentPeople } from "@/lib/department-authority/vendor-workforce";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

export default async function PartnerPeoplePage() {
  const session = await getPartnerFacilitySession();
  if (!session) redirect("/login");
  const context = await requirePartnerOperationalContext();
  const access = await resolveDepartmentAccess(prisma, session, {
    facilityId: session.facilityId,
    departmentId: context.activeDepartmentId,
  });
  if (!access?.isHead || access.mode !== "MANAGE") redirect("/partner");

  const people = await listVendorDepartmentPeople(prisma, {
    facilityId: session.facilityId,
    departmentId: context.activeDepartmentId,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="vendor-people-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Hourly staff use a PIN at the facility. This record stays with your organization.
        </p>
      </div>
      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">Add a PIN record</h2>
        <div className="mt-3">
          <VendorPinForm />
        </div>
      </section>
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
        {people.length === 0 ? (
          <li className="px-4 py-4 text-sm text-zinc-600">No staff in this Department yet.</li>
        ) : (
          people.map((person) => (
            <li key={person.id} className="px-4 py-3 text-sm text-zinc-800" data-testid="vendor-person">
              {person.name}
              <span className="ml-2 text-zinc-500">
                {person.hasPin ? "PIN" : "No PIN"}
                {person.hasAccount ? " · account" : ""}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

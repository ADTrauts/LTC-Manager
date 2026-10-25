import { redirect } from "next/navigation";

import { getPartnerFacilitySession } from "@/lib/auth";
import { partnerMaySetUpDepartment } from "@/lib/department-authority/partner-setup";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import { listVendorDepartmentPeople } from "@/lib/department-authority/vendor-workforce";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

import { PartnerCoverageForms } from "./forms";

export default async function PartnerCoveragePage() {
  if (!isContractedDepartmentAuthorityEnabled()) redirect("/partner");
  const session = await getPartnerFacilitySession();
  if (!session) redirect("/login");
  const context = await requirePartnerOperationalContext();
  const access = await resolveDepartmentAccess(prisma, session, {
    facilityId: session.facilityId,
    departmentId: context.activeDepartmentId,
  });
  if (
    !access ||
    !partnerMaySetUpDepartment({
      mode: access.mode,
      isHead: access.isHead,
      effectiveRole: context.effectiveRole,
    })
  ) {
    redirect("/partner");
  }

  const [people, places, teams] = await Promise.all([
    listVendorDepartmentPeople(prisma, {
      facilityId: session.facilityId,
      departmentId: context.activeDepartmentId,
    }),
    prisma.unit.findMany({
      where: {
        facilityId: session.facilityId,
        isActive: true,
        departmentResponsibilities: { some: { departmentId: context.activeDepartmentId } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.departmentTeam.findMany({
      where: { facilityId: session.facilityId, departmentId: context.activeDepartmentId, status: "ACTIVE" },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="partner-coverage-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">People & Coverage</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Shifts, call-offs, and moves for this Department. Rooms stay the facility's.
        </p>
      </div>
      <PartnerCoverageForms people={people} places={places} />
      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold">Teams</h2>
        {teams.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No teams yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100 text-sm">
            {teams.map((team) => (
              <li key={team.id} className="py-2">
                {team.displayName}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

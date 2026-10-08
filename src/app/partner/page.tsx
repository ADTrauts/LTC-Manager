import { redirect } from "next/navigation";

import { leavePartnerFacilityAction } from "@/app/partner/actions";
import { getPartnerFacilitySession } from "@/lib/auth";
import { partnerRoleLabel } from "@/lib/partner-user-access";
import { resolveFacilityAuthorization } from "@/lib/partner-user-access";
import { prisma } from "@/lib/prisma";

export default async function PartnerFacilityHoldingPage() {
  const session = await getPartnerFacilitySession();
  if (!session) {
    redirect("/partner/exit");
  }

  const resolved = await resolveFacilityAuthorization(prisma, {
    userId: session.uid,
    facilityId: session.facilityId,
    accessKind: "partner",
    facilityPartnerOrganizationId: session.facilityPartnerOrganizationId,
  });
  if (
    resolved.authorization.path !== "partner" ||
    resolved.authorization.partnerOrganizationId !== session.partnerOrganizationId ||
    resolved.authorization.allowedDepartmentIds.length === 0
  ) {
    redirect("/partner/exit");
  }

  const [facility, organization, departments] = await Promise.all([
    prisma.facility.findUnique({
      where: { id: session.facilityId },
      select: { displayName: true },
    }),
    prisma.organization.findUnique({
      where: { id: session.partnerOrganizationId },
      select: { name: true, displayName: true },
    }),
    prisma.department.findMany({
      where: {
        id: { in: resolved.authorization.allowedDepartmentIds },
        facilityId: session.facilityId,
        isActive: true,
      },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const organizationName = organization?.displayName?.trim() || organization?.name || "your Organization";

  return (
    <main className="mx-auto max-w-lg px-6 py-16" data-testid="partner-holding">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Partner access</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
        {facility?.displayName ?? "Facility"}
      </h1>
      <p className="mt-1 text-sm text-zinc-600">{organizationName}</p>
      <dl className="mt-6 space-y-2 text-sm text-zinc-800">
        <div>
          <dt className="inline font-medium">Partner role </dt>
          <dd className="inline" data-testid="partner-effective-role">
            {partnerRoleLabel(resolved.authorization.effectiveRole)}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Authorized departments</dt>
          <dd data-testid="partner-departments">
            {departments.length > 0 ? (
              <ul className="mt-1 list-disc pl-5">
                {departments.map((department) => (
                  <li key={department.name}>{department.name}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-zinc-500">None</p>
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-6 text-sm text-zinc-700">Your partner access is active.</p>
      <p className="mt-1 text-sm text-zinc-600">
        Operational screens will become available as they are enabled for partner access.
      </p>
      <form action={leavePartnerFacilityAction} className="mt-8">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
        >
          Return to {organizationName}
        </button>
      </form>
    </main>
  );
}

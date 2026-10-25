import { redirect } from "next/navigation";

import { getPartnerFacilitySession } from "@/lib/auth";
import { partnerMaySetUpDepartment } from "@/lib/department-authority/partner-setup";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

import { PartnerWorkForms } from "./forms";

export default async function PartnerWorkPage() {
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

  const [plans, forms] = await Promise.all([
    prisma.departmentWorkPlan.findMany({
      where: { facilityId: session.facilityId, departmentId: context.activeDepartmentId },
      select: { id: true, name: true, status: true },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 40,
    }),
    prisma.catalogLogDefinition.findMany({
      where: {
        ownerKind: "ORGANIZATION",
        ownerOrganizationId: session.partnerOrganizationId,
        status: "PUBLISHED",
      },
      select: { stableKey: true, name: true },
      orderBy: { name: "asc" },
      take: 40,
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="partner-work-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Work</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Work plans for this Department. A step can open one of your organization's Catalog Records.
        </p>
      </div>
      <PartnerWorkForms
        drafts={plans.filter((plan) => plan.status === "DRAFT")}
        forms={forms}
      />
      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold">Plans</h2>
        {plans.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No work plans yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100 text-sm">
            {plans.map((plan) => (
              <li key={plan.id} className="flex justify-between gap-3 py-2">
                <span>{plan.name}</span>
                <span className="text-zinc-500">{plan.status === "DRAFT" ? "Draft" : "Published"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

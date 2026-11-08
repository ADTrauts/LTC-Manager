import Link from "next/link";
import { redirect } from "next/navigation";

import { getPartnerFacilitySession } from "@/lib/auth";
import { partnerMaySetUpDepartment } from "@/lib/department-authority/partner-setup";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import { GENERIC_WORK_AUTHORING_RETIRED } from "@/lib/department-work";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

/**
 * Partner generic Work Plan authoring is retired (Phase 2B).
 * Existing plans remain listed read-only for awareness.
 */
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

  const plans = await prisma.departmentWorkPlan.findMany({
    where: { facilityId: session.facilityId, departmentId: context.activeDepartmentId },
    select: { id: true, name: true, status: true },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 40,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="partner-work-page-retired">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Work (retired)</h1>
        <p className="mt-1 text-sm text-zinc-600">{GENERIC_WORK_AUTHORING_RETIRED}</p>
      </div>
      <p className="text-sm text-zinc-600">
        Use partner Operating Rhythm, Records, Coverage, and Maintenance surfaces that remain
        available for this Department.{" "}
        <Link href="/partner" className="font-medium underline underline-offset-2">
          Partner home
        </Link>
      </p>
      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold">Existing plans (read-only)</h2>
        {plans.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No work plans on file.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100 text-sm">
            {plans.map((plan) => (
              <li key={plan.id} className="flex justify-between gap-3 py-2">
                <span>{plan.name}</span>
                <span className="text-zinc-500">
                  {plan.status === "DRAFT" ? "Draft" : plan.status === "PUBLISHED" ? "Published" : plan.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

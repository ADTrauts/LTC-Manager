import { redirect } from "next/navigation";

import { getPartnerFacilitySession } from "@/lib/auth";
import { partnerMaySetUpDepartment } from "@/lib/department-authority/partner-setup";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

import { PartnerRhythmForms } from "./forms";

export default async function PartnerRhythmPage() {
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

  const rows = await prisma.departmentOperationalCycle.findMany({
    where: { facilityId: session.facilityId, departmentId: context.activeDepartmentId },
    select: {
      id: true,
      stableKey: true,
      label: true,
      status: true,
      nodeKind: true,
      parentStableKey: true,
      startLocal: true,
      endLocal: true,
    },
    orderBy: [{ status: "asc" }, { label: "asc" }],
    take: 80,
  });
  const drafts = rows.filter(
    (row) => row.status === "DRAFT" && row.nodeKind === "PERIOD" && !row.parentStableKey,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="partner-rhythm-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operating Rhythm</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Cycles, phases, and key points for this Department. They use the facility rooms.
        </p>
      </div>
      <PartnerRhythmForms drafts={drafts} />
      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold">This Department</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No cycles yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100 text-sm">
            {rows.map((row) => (
              <li key={row.id} className="flex justify-between gap-3 py-2">
                <span>
                  {row.parentStableKey ? "· " : ""}
                  {row.label}
                  <span className="ml-2 text-zinc-500">
                    {row.nodeKind === "KEY_TIME" ? "Key point" : row.parentStableKey ? "Phase" : "Cycle"}
                  </span>
                </span>
                <span className="text-zinc-500">{row.status === "DRAFT" ? "Draft" : "Published"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

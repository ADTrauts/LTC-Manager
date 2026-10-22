import { redirect } from "next/navigation";

import { listVendorArchive } from "@/lib/department-authority/operator-period";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { requireOrganizationSession } from "@/lib/organization-context";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ organizationId: string }> };

function dateLabel(value: Date | null): string {
  if (!value) return "open";
  return value.toISOString().slice(0, 10);
}

export default async function OrganizationArchivePage({ params }: PageProps) {
  const { organizationId } = await params;
  let session;
  let membership;
  try {
    const required = await requireOrganizationSession();
    session = required.session;
    membership = required.membership;
  } catch {
    redirect("/login");
  }
  if (session.organizationId !== organizationId) redirect("/organization");

  const enabled = isContractedDepartmentAuthorityEnabled();
  const isAdmin = membership.currentRole === "ORG_ADMIN";
  const periods = enabled && isAdmin ? await listVendorArchive(prisma, organizationId) : [];

  return (
    <section className="mx-auto max-w-3xl space-y-4" data-testid="vendor-archive">
      <h1 className="text-2xl font-semibold tracking-tight">Archive</h1>
      {!enabled ? <p className="text-sm text-zinc-600">The archive is not in effect.</p> : null}
      {enabled && !isAdmin ? (
        <p className="text-sm text-zinc-600">The company administrator opens ended operator periods.</p>
      ) : null}
      {enabled && isAdmin && periods.length === 0 ? (
        <p className="text-sm text-zinc-600">No ended periods.</p>
      ) : null}
      {periods.map((period) => (
        <article key={period.id} className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">
            {period.department.name}
            <span className="font-normal text-zinc-600"> · {period.department.facility.displayName}</span>
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {dateLabel(period.effectiveFrom)} – {dateLabel(period.effectiveTo)}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-zinc-800 sm:grid-cols-5">
            <div>
              <dt className="text-zinc-500">Menus</dt>
              <dd>{period._count.menus}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Work Plans</dt>
              <dd>{period._count.workPlans}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Operating Rhythm</dt>
              <dd>{period._count.operationalCycles}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">People</dt>
              <dd>{period._count.employees}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Records</dt>
              <dd>{period._count.evidenceRecords}</dd>
            </div>
          </dl>
        </article>
      ))}
    </section>
  );
}

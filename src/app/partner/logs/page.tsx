import { unstable_noStore as noStore } from "next/cache";

import { RunLogRequirementList } from "@/components/canonical-logs/run-log-requirement-list";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { loadPartnerRunLogRequirements } from "@/lib/canonical-logs/partner-log-read";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

export default async function PartnerLogsPage() {
  noStore();
  const context = await requirePartnerOperationalContext();
  const departmentName =
    (await prisma.department.findFirst({
      where: {
        id: context.activeDepartmentId,
        facilityId: context.facilityId,
        isActive: true,
      },
      select: { name: true },
    }))?.name ?? "Department";

  if (!isCanonicalLogsEnabled()) {
    return (
      <section className="space-y-2" data-testid="partner-logs-unavailable">
        <h2 className="text-lg font-semibold">Logs</h2>
        <p className="text-sm text-zinc-600">Canonical Logs are not enabled.</p>
      </section>
    );
  }

  const bundle = await loadPartnerRunLogRequirements({ client: prisma, context });

  return (
    <section className="space-y-4" data-testid="partner-logs">
      <div>
        <h2 className="text-lg font-semibold">Logs</h2>
        <p className="text-sm text-zinc-600">
          {departmentName} · {bundle.operationalDateKey}
        </p>
      </div>
      <RunLogRequirementList
        requirements={bundle.requirements}
        adHocAttachments={bundle.adHocAttachments}
        includeNeedsSetup={false}
        isManager={false}
        upcoming={bundle.upcoming}
        departmentName={departmentName}
      />
    </section>
  );
}

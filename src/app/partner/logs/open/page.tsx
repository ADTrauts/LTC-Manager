import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { CanonicalLogEntryForm } from "@/components/canonical-logs/canonical-log-entry-form";
import { loadPartnerRunLogRequirements } from "@/lib/canonical-logs/partner-log-read";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { canPartner } from "@/lib/partner-user-access";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{ attachmentId?: string; requirementKey?: string }>;

export default async function PartnerOpenLogPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  if (!isCanonicalLogsEnabled()) redirect("/partner/logs");

  const context = await requirePartnerOperationalContext();
  if (!canPartner(context.effectiveRole, "logs.submit")) redirect("/partner/logs");

  const query = await searchParams;
  const attachmentId = query.attachmentId?.trim();
  const requirementKey = query.requirementKey?.trim();
  if (!attachmentId || !requirementKey) redirect("/partner/logs");

  const bundle = await loadPartnerRunLogRequirements({ client: prisma, context });
  const view = bundle.requirements.find(
    (row) => row.attachmentId === attachmentId && row.requirementKey === requirementKey,
  );
  if (!view || view.departmentId !== context.activeDepartmentId) notFound();
  if (view.productState === "COMPLETED" || view.productState === "COMPLETED_WITH_EXCEPTION") {
    if (view.recordId) redirect(`/partner/logs/records/${view.recordId}`);
    redirect("/partner/logs");
  }
  if (view.productState === "NEEDS_SETUP") {
    return (
      <section className="space-y-3">
        <h1 className="text-lg font-semibold">Needs setup</h1>
        <p className="text-sm text-zinc-700">This Log cannot run until its schedule is updated.</p>
        <Link href="/partner/logs" className="text-sm underline">
          Back to Logs
        </Link>
      </section>
    );
  }

  return (
    <CanonicalLogEntryForm
      audience="partner"
      facilityId={context.facilityId}
      departmentId={view.departmentId}
      attachmentId={view.attachmentId}
      operationalDateKey={view.operationalDateKey}
      displayName={view.displayName}
      catalogDefinitionName={view.catalogDefinitionName}
      targetLabel={view.targetLabel}
      timingContextLabel={view.timingContextLabel}
      catalogInstructions={view.catalogInstructions}
      localInstructions={view.localInstructions}
      fields={view.fields}
      requirementKey={view.requirementKey}
      cycleStableKey={view.cycleStableKey}
      cycleLabel={view.cycleLabel}
      windowStartLocal={view.windowStartLocal}
      windowEndLocal={view.windowEndLocal}
      cancelHref="/partner/logs"
    />
  );
}

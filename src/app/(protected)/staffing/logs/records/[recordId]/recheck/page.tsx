import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { CanonicalLogEntryForm } from "@/components/canonical-logs/canonical-log-entry-form";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { loadCanonicalRecheckForm } from "@/lib/canonical-logs/load-canonical-recheck";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ recordId: string }>;
};

export default async function CanonicalLogRecheckPage({ params }: Props) {
  noStore();
  if (!isCanonicalLogsEnabled()) redirect("/logs");

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "STAFF")) redirect("/workspace");

  const { recordId } = await params;
  const form = await loadCanonicalRecheckForm({
    client: prisma,
    facilityId: session.facilityId,
    recordId,
  });
  if (!form) notFound();

  const timezone = await loadFacilityTimezone(prisma, session.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone));

  return (
    <section className="mx-auto max-w-xl space-y-4 px-3 py-4" data-testid="canonical-recheck-form">
      <div className="rounded-md border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
        <p className="font-medium text-zinc-900">Recheck {form.displayName}</p>
        <p className="mt-1">{form.targetLabel}</p>
        <p className="mt-1 text-xs text-zinc-600">
          Original reading: {form.originalValueLabel} · {form.originalAtLabel}
        </p>
        {form.expectedRangeLabel ? (
          <p className="text-xs text-zinc-600">Expected: {form.expectedRangeLabel}</p>
        ) : null}
        <p className="text-xs text-zinc-500">Catalog version {form.catalogVersion}</p>
      </div>
      <CanonicalLogEntryForm
        facilityId={form.facilityId}
        departmentId={form.departmentId}
        attachmentId={form.attachmentId}
        operationalDateKey={operationalDateKey}
        displayName={form.displayName}
        catalogDefinitionName={form.catalogDefinitionName}
        targetLabel={form.targetLabel}
        timingContextLabel="Recheck"
        catalogInstructions={form.catalogInstructions}
        localInstructions={form.localInstructions}
        fields={form.fields}
        requirementKey={null}
        cycleStableKey={null}
        cycleLabel={null}
        windowStartLocal={null}
        windowEndLocal={null}
        adHoc
        rules={form.rules}
        followsRecordId={form.recordId}
        cancelHref={`/staffing/logs/records/${form.recordId}`}
      />
    </section>
  );
}

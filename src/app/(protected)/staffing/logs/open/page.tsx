import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { CanonicalLogEntryForm } from "@/components/canonical-logs/canonical-log-entry-form";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { loadRunLogRequirementByKey } from "@/lib/canonical-logs/load-run-requirements";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{
  attachmentId?: string;
  requirementKey?: string;
}>;

export default async function OpenCanonicalLogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  if (!isCanonicalLogsEnabled()) redirect("/logs");

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "STAFF")) redirect("/workspace");

  const query = await searchParams;
  const attachmentId = query.attachmentId?.trim();
  const requirementKey = query.requirementKey?.trim();
  if (!attachmentId || !requirementKey) redirect("/staffing/logs");

  const view = await loadRunLogRequirementByKey({
    client: prisma,
    session,
    facilityId: session.facilityId,
    attachmentId,
    requirementKey,
  });
  if (!view) notFound();

  if (
    view.productState === "COMPLETED" ||
    view.productState === "COMPLETED_WITH_EXCEPTION"
  ) {
    if (view.recordId) redirect(`/staffing/logs/records/${view.recordId}`);
    redirect("/staffing/logs");
  }

  if (view.productState === "NEEDS_SETUP") {
    return (
      <section className="mx-auto max-w-xl space-y-3 p-4">
        <h1 className="text-lg font-semibold">Needs setup</h1>
        <p className="text-sm text-zinc-700">
          This Log cannot run until its schedule is updated.
        </p>
        {hasAtLeastRole(session.role, "MANAGER") ? (
          <Link
            href={`/build/logs/attachments/${view.attachmentId}`}
            className="inline-flex min-h-11 items-center rounded-md border border-zinc-900 bg-zinc-900 px-3 text-sm font-medium text-white"
          >
            Open Build settings
          </Link>
        ) : (
          <p className="text-xs text-zinc-500">Ask a manager to update Build settings.</p>
        )}
        <Link href="/staffing/logs" className="block text-sm underline">
          Back to Logs
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl px-3 py-4">
      <CanonicalLogEntryForm
        facilityId={session.facilityId}
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
        cancelHref="/staffing/logs"
      />
    </section>
  );
}

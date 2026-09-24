import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { PageHeader, StatusBadge } from "@/components/design-system";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { loadRunLogRecordView } from "@/lib/canonical-logs/load-run-log-record";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ recordId: string }>;
  searchParams: Promise<{ justCompleted?: string }>;
};

export default async function CanonicalLogRecordPage({ params, searchParams }: Props) {
  noStore();
  if (!isCanonicalLogsEnabled()) redirect("/staffing/log-book");

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "STAFF")) redirect("/workspace");

  const { recordId } = await params;
  const query = await searchParams;
  const view = await loadRunLogRecordView({
    client: prisma,
    session,
    facilityId: session.facilityId,
    recordId,
  });
  if (!view) notFound();

  return (
    <section
      className="mx-auto max-w-3xl space-y-4 px-3 py-4"
      data-testid="canonical-log-record"
    >
      <PageHeader
        title={view.displayName}
        subtitle={
          view.displayName !== view.catalogDefinitionName
            ? view.catalogDefinitionName
            : undefined
        }
        compact
        actions={
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/staffing/logs" className="underline-offset-2 hover:underline">
              Back to Logs
            </Link>
            {hasAtLeastRole(session.role, "SUPERVISOR") && session.authMethod !== "QUICK_PIN" ? (
              <Link href="/staffing/log-book" className="underline-offset-2 hover:underline">
                Log Book
              </Link>
            ) : null}
          </div>
        }
      />

      {query.justCompleted === "1" ? (
        <div
          className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800"
          role="status"
          data-testid="log-completed-banner"
        >
          {view.isException ? (
            <>
              <p className="font-medium">Complete with corrective action</p>
              {view.fields[0]?.displayValue ? (
                <p className="text-xs">{view.fields[0].displayValue} recorded</p>
              ) : (
                <p className="text-xs">Your corrective action was recorded.</p>
              )}
            </>
          ) : (
            <>
              <p className="font-medium">Complete</p>
              {view.fields[0]?.displayValue ? (
                <p className="text-xs">{view.fields[0].displayValue} recorded</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant={view.isException ? "warning" : "neutral"}>
            {view.statusLabel}
          </StatusBadge>
          {view.needsSupervisorReview && hasAtLeastRole(session.role, "SUPERVISOR") ? (
            <StatusBadge variant="warning">Needs review</StatusBadge>
          ) : null}
        </div>
        <p className="text-sm text-zinc-700">{view.targetLabel}</p>
        <p className="text-xs text-zinc-600">
          {view.departmentName}
          {view.timingContextLabel ? ` · ${view.timingContextLabel}` : ""}
          {` · ${view.operationalDateKey}`}
        </p>
        <p className="text-xs text-zinc-500">
          {view.completedAtLabel}
          {view.completedByLabel ? ` · ${view.completedByLabel}` : ""}
          {view.catalogVersion != null ? ` · Catalog version ${view.catalogVersion}` : ""}
        </p>

        {view.localInstructions ? (
          <p className="text-sm text-zinc-700">
            <span className="font-medium">Facility note: </span>
            {view.localInstructions}
          </p>
        ) : null}

        {view.correctiveActionText ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium">Corrective action</p>
            <p className="mt-1">{view.correctiveActionText}</p>
          </div>
        ) : null}

        {view.amendments.length > 0 ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-zinc-900">Amendments</p>
            <ul className="space-y-1 text-xs text-zinc-600">
              {view.amendments.map((row) => (
                <li key={row.id}>
                  {row.atLabel}
                  {row.byLabel ? ` · ${row.byLabel}` : ""} — {row.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-100">
          {view.fields.map((field) => (
            <li key={field.label} className="px-3 py-2">
              <p className="text-sm font-medium text-zinc-900">{field.label}</p>
              <p className="text-sm text-zinc-800">{field.displayValue}</p>
              {field.rangeLabel ? (
                <p className="text-xs text-zinc-500">Expected {field.rangeLabel}</p>
              ) : null}
              {field.outOfStandard ? (
                <p className="text-xs font-medium text-amber-900">Outside expected range</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

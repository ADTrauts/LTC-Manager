import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { createIssueFromRecordAction } from "@/app/(protected)/asset-issues/actions";
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

        {view.followsRecordSummary ? (
          <p className="text-sm text-zinc-700">
            Follow-up to:{" "}
            <Link
              href={`/staffing/logs/records/${view.followsRecordSummary.id}`}
              className="underline"
            >
              {view.followsRecordSummary.label} · {view.followsRecordSummary.displayValue} ·{" "}
              {view.followsRecordSummary.atLabel}
            </Link>
          </p>
        ) : null}
        {view.followUps.length > 0 ? (
          <div className="text-sm text-zinc-700">
            <p className="font-medium">Follow-up records</p>
            <ul className="mt-1 space-y-1">
              {view.followUps.map((row) => (
                <li key={row.id}>
                  <Link href={`/staffing/logs/records/${row.id}`} className="underline">
                    {row.displayValue} · {row.atLabel} · {row.statusLabel}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {view.inspection && view.inspection.outcome ? (
          <div className="space-y-2 rounded-md border border-zinc-200 bg-white p-3 text-sm" data-testid="inspection-score">
            <p className="text-lg font-semibold text-zinc-900">
              {view.inspection.percentage}%
            </p>
            <p>
              Outcome{" "}
              <span className="font-medium">
                {view.inspection.outcome === "PASS"
                  ? "Pass"
                  : view.inspection.outcome === "PASS_WITH_EXCEPTIONS"
                    ? "Pass with exceptions"
                    : "Fail"}
              </span>
            </p>
            <p>Critical failures {view.inspection.criticalFailures.length}</p>
            {view.inspection.sectionScores.length > 0 ? (
              <ul className="space-y-1 text-zinc-700">
                {view.inspection.sectionScores.map((section) => (
                  <li key={section.sectionKey}>
                    {section.label} {section.earnedPoints} / {section.possiblePoints}
                    {section.percentage != null ? ` · ${section.percentage}%` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {view.inspection.exceptions.length > 0 ? (
              <div>
                <p className="font-medium">Exceptions</p>
                <ul className="mt-1 list-disc pl-4">
                  {view.inspection.exceptions.map((row) => (
                    <li key={row.fieldKey}>
                      {row.label}: {row.display}
                      {row.critical ? " · Critical" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {view.correctiveActionText ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium">Corrective action</p>
            <p className="mt-1">{view.correctiveActionText}</p>
          </div>
        ) : null}

        {view.canRecheck ? (
          <p className="text-sm">
            <Link
              href={`/staffing/logs/records/${view.id}/recheck`}
              className="underline"
              data-testid="record-recheck"
            >
              Record a recheck
            </Link>
          </p>
        ) : null}

        {view.canCreateIssue && hasAtLeastRole(session.role, "SUPERVISOR") ? (
          <form action={createIssueFromRecordAction}>
            <input type="hidden" name="departmentId" value={view.departmentId} />
            <input type="hidden" name="evidenceRecordId" value={view.id} />
            <button
              type="submit"
              className="rounded-md border border-zinc-900 px-3 py-2 text-sm font-medium"
            >
              Create Issue
            </button>
          </form>
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

        {view.attachments.length > 0 ? (
          <ul className="space-y-3" data-testid="evidence-attachments">
            {view.attachments.map((item) => (
              <li key={item.id} className="text-sm text-zinc-800">
                {item.kind === "PHOTO" ? (
                  <a href={`/api/evidence-attachments/${item.id}`} className="inline-block">
                    {/* Protected facility route. The storage key is not shown. */}
                    <img
                      src={`/api/evidence-attachments/${item.id}`}
                      alt={item.originalFilename || "Condition photo"}
                      className="max-h-48 rounded-md border border-zinc-200"
                    />
                  </a>
                ) : null}
                {item.kind === "FILE" ? (
                  <a href={`/api/evidence-attachments/${item.id}`} className="underline">
                    {item.originalFilename || "Supporting document"}
                  </a>
                ) : null}
                {item.kind === "SIGNATURE" ? (
                  <div>
                    <img
                      src={`/api/evidence-attachments/${item.id}`}
                      alt="Signature"
                      className="max-h-24 rounded-md border border-zinc-200 bg-white"
                    />
                    <p className="mt-1 text-xs text-zinc-600">
                      Signed by {item.uploadedByLabel || "the signed-in person"}
                      {` · Signed at ${item.createdAtLabel}`}
                    </p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
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

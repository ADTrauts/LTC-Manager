import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { loadPartnerRunLogRecord } from "@/lib/canonical-logs/partner-log-read";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ recordId: string }> };

export default async function PartnerLogRecordPage({ params }: Props) {
  noStore();
  if (!isCanonicalLogsEnabled()) notFound();

  const context = await requirePartnerOperationalContext();
  const { recordId } = await params;
  const view = await loadPartnerRunLogRecord({ client: prisma, context, recordId });
  if (!view) notFound();

  return (
    <section className="space-y-4" data-testid="partner-log-record">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{view.displayName}</h2>
          <p className="text-sm text-zinc-600">
            {view.departmentName}
            {view.timingContextLabel ? ` · ${view.timingContextLabel}` : ""} · {view.operationalDateKey}
          </p>
        </div>
        <Link href="/partner/logs" className="text-sm font-medium underline-offset-2 hover:underline">
          Back to Logs
        </Link>
      </div>
      <div className="space-y-3 rounded-md border border-zinc-200 bg-white p-4 text-sm">
        <p>{view.statusLabel}</p>
        <p className="text-zinc-700">{view.targetLabel}</p>
        <p className="text-xs text-zinc-500">
          {view.completedAtLabel}
          {view.completedByLabel ? ` · ${view.completedByLabel}` : ""}
        </p>
        {view.correctiveActionText ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="font-medium">Corrective action</p>
            <p className="mt-1">{view.correctiveActionText}</p>
          </div>
        ) : null}
        <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
          {view.fields.map((field) => (
            <li key={field.label} className="py-2">
              <p className="font-medium">{field.label}</p>
              <p>{field.displayValue}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

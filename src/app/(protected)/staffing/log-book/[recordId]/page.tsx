import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { PageHeader, StatusBadge } from "@/components/design-system";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { isDietaryOperationalEvidenceEnabled } from "@/lib/feature-flags";
import { loadEvidenceRecordDetail } from "@/lib/operational-evidence";
import { toServiceDateKey } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

export default async function EvidenceLogBookRecordPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  noStore();

  if (!isDietaryOperationalEvidenceEnabled()) {
    redirect("/staffing");
  }

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) redirect("/workspace");

  const { recordId } = await params;
  const stub = await prisma.operationalEvidenceRecord.findFirst({
    where: { id: recordId, facilityId: session.facilityId },
    select: { departmentId: true },
  });
  if (!stub) {
    return (
      <section className="mx-auto max-w-3xl">
        <PageHeader title="Evidence record" subtitle="Record not found." compact />
      </section>
    );
  }

  const detail = await loadEvidenceRecordDetail({
    session,
    facilityId: session.facilityId,
    departmentId: stub.departmentId,
    recordId,
  });
  const record = detail.record;
  const snapshot =
    record.templateSnapshotJson && typeof record.templateSnapshotJson === "object"
      ? (record.templateSnapshotJson as { name?: string; version?: number; instructions?: string })
      : {};

  return (
    <section
      className="mx-auto max-w-3xl space-y-4 print:max-w-none"
      data-testid="evidence-record-detail"
    >
      <PageHeader
        title={record.templateName}
        subtitle={`Version ${record.templateVersion} · ${record.purposeType}`}
        compact
        actions={
          <div className="flex gap-3 text-sm print:hidden">
            <Link href="/staffing/log-book" className="underline-offset-2 hover:underline">
              Back to Log Book
            </Link>
            <span className="text-zinc-500">Use browser Print for printable view</span>
          </div>
        }
      />

      <div className="rounded-md border border-zinc-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant="neutral">{record.status.replaceAll("_", " ")}</StatusBadge>
          {record.outOfStandard ? <StatusBadge variant="warning">Out of standard</StatusBadge> : null}
          {!record.recordedOnline ? <StatusBadge variant="in_progress">Recorded offline</StatusBadge> : null}
        </div>
        <p className="text-sm text-zinc-700">
          Operational date {toServiceDateKey(record.operationalDate)}
          {record.windowStartLocal
            ? ` · ${record.windowStartLocal}–${record.windowEndLocal ?? ""}`
            : ""}
          {record.cycleLabel ? ` · ${record.cycleLabel}` : ""}
        </p>
        <p className="text-xs text-zinc-500">
          Occurred {record.occurredAt.toISOString()} · Recorded {record.recordedAt.toISOString()}
          {record.synchronizedAt ? ` · Synced ${record.synchronizedAt.toISOString()}` : ""}
          {record.recordedByLabel ? ` · ${record.recordedByLabel}` : ""}
        </p>
        {snapshot.instructions ? (
          <p className="text-sm text-zinc-700">{snapshot.instructions}</p>
        ) : null}
        {record.correctiveActionText ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium">Corrective action</p>
            <p className="mt-1">{record.correctiveActionText}</p>
          </div>
        ) : null}
        <ul className="divide-y divide-zinc-100 border border-zinc-100 rounded-md">
          {record.values.map((value) => (
            <li key={value.id} className="px-3 py-2 text-sm">
              <span className="font-medium text-zinc-800">{value.label}</span>
              <span className="ml-2 text-zinc-700">
                {value.valueNumber != null
                  ? String(value.valueNumber)
                  : value.valueBoolean != null
                    ? value.valueBoolean
                      ? "Yes"
                      : "No"
                    : value.valueSelections.length
                      ? value.valueSelections.join(", ")
                      : (value.valueText ?? "—")}
              </span>
              {value.outOfStandard ? (
                <span className="ml-2 text-xs text-amber-800">out of standard</span>
              ) : null}
            </li>
          ))}
        </ul>
        {record.corrections.length > 0 ? (
          <div data-testid="evidence-correction-history">
            <h3 className="text-sm font-semibold text-zinc-900">Correction history</h3>
            <ul className="mt-2 space-y-2 text-xs text-zinc-600">
              {record.corrections.map((c) => (
                <li key={c.id} className="rounded border border-zinc-100 px-2 py-1.5">
                  {c.createdAt.toISOString()} · {c.correctedByLabel ?? "Authorized correction"} ·{" "}
                  {c.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="text-xs text-zinc-500">
          Historical template snapshot preserved at submit (v{record.templateVersion}
          {snapshot.name ? ` · ${snapshot.name}` : ""}). Later template edits do not rewrite this
          record.
        </p>
      </div>
    </section>
  );
}

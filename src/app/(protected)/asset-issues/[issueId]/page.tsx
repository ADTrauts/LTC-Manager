import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import {
  acknowledgeAssetIssueAction,
  closeAssetIssueAction,
  createWorkOrderFromAssetIssueAction,
  linkEvidenceToAssetIssueAction,
  markAssetIssueMonitoringAction,
  reopenAssetIssueAction,
  resolveAssetIssueAction,
  triageAssetIssueAction,
} from "@/app/(protected)/asset-issues/actions";
import { updateAssetStatusAction } from "@/app/(protected)/assets/actions";
import {
  assetIssueStatusLabel,
  assetStatusLabel,
  getIssueDetail,
  operationalImpactLabel,
  resolveAssetOperationsAuthority,
  workOrderStatusLabel,
} from "@/lib/asset-operations";
import { getSession, sessionUserIdForFk } from "@/lib/auth";
import { isDietaryAssetOperationsEnabled } from "@/lib/feature-flags";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ issueId: string }>;
};

export default async function AssetIssueDetailPage({ params }: Props) {
  noStore();
  if (!isDietaryAssetOperationsEnabled()) {
    redirect("/assets");
  }

  const { issueId } = await params;
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");

  const scoped = await prisma.assetIssue.findFirst({
    where: { id: issueId, facilityId: session.facilityId },
    select: {
      id: true,
      departmentId: true,
      reportedByUserId: true,
      reportedByEmployeeId: true,
    },
  });
  if (!scoped) notFound();

  const authority = await resolveAssetOperationsAuthority(
    session,
    session.facilityId,
    scoped.departmentId,
  );

  const sessionUserId = sessionUserIdForFk(session);
  const sessionEmployeeId = await getOperationalEmployeeIdForSession(session);
  const isOwnReport =
    (sessionUserId && scoped.reportedByUserId === sessionUserId) ||
    (sessionEmployeeId && scoped.reportedByEmployeeId === sessionEmployeeId);

  if (!authority.canTriageIssue && !authority.canManageWorkOrders) {
    if (!isOwnReport) {
      notFound();
    }
  }

  let detail;
  try {
    detail = await getIssueDetail(session, {
      facilityId: session.facilityId,
      departmentId: scoped.departmentId,
      issueId,
    });
  } catch {
    notFound();
  }

  const vendors = authority.canAssignVendor
    ? await prisma.vendor.findMany({
        where: { facilityId: session.facilityId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const canTriage = authority.canTriageIssue;
  const canManageWo = authority.canManageWorkOrders;
  const canChangeStatus = authority.canChangeAssetStatus;

  return (
    <section className="space-y-6" data-testid="asset-issue-detail">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          <Link href={`/assets/${detail.assetId}`} className="underline underline-offset-2">
            {detail.asset.assetCode}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {detail.issueCode} · {detail.summary}
        </h1>
        <p className="text-sm text-zinc-600">
          {assetIssueStatusLabel(detail.status)} · {operationalImpactLabel(detail.operationalImpact)} ·{" "}
          {detail.unit.name}
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Report</h2>
        <dl className="mt-3 grid gap-2 text-sm text-zinc-700 md:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-zinc-500">Asset</dt>
            <dd>
              <Link href={`/assets/${detail.asset.id}`} className="underline underline-offset-2">
                {detail.asset.assetCode} · {detail.asset.name}
              </Link>{" "}
              ({assetStatusLabel(detail.asset.status)})
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-zinc-500">Observed</dt>
            <dd>{detail.observedAt.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-zinc-500">Reported</dt>
            <dd>
              {detail.reportedAt.toLocaleString()}
              {detail.reportedByLabel ? ` · ${detail.reportedByLabel}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-zinc-500">Usable</dt>
            <dd>{detail.equipmentRemainsUsable ? "Yes" : "No"}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-xs uppercase text-zinc-500">Description</dt>
            <dd className="whitespace-pre-wrap">{detail.description}</dd>
          </div>
          {detail.workaroundInstruction ? (
            <div className="md:col-span-2">
              <dt className="text-xs uppercase text-zinc-500">Workaround</dt>
              <dd>{detail.workaroundInstruction}</dd>
            </div>
          ) : null}
          {canTriage && detail.triageNote ? (
            <div className="md:col-span-2">
              <dt className="text-xs uppercase text-zinc-500">Triage note</dt>
              <dd>{detail.triageNote}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {canTriage ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="asset-issue-triage">
          <h2 className="text-lg font-semibold text-zinc-900">Triage</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={acknowledgeAssetIssueAction}>
              <input type="hidden" name="issueId" value={detail.id} />
              <input type="hidden" name="departmentId" value={detail.departmentId} />
              <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100" data-testid="acknowledge-issue">
                Acknowledge
              </button>
            </form>
            <form action={triageAssetIssueAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="issueId" value={detail.id} />
              <input type="hidden" name="departmentId" value={detail.departmentId} />
              <input
                name="triageNote"
                placeholder="Triage note"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100" data-testid="triage-issue">
                Triage
              </button>
            </form>
            <form action={markAssetIssueMonitoringAction}>
              <input type="hidden" name="issueId" value={detail.id} />
              <input type="hidden" name="departmentId" value={detail.departmentId} />
              <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100" data-testid="monitor-issue">
                Monitoring
              </button>
            </form>
            <form action={resolveAssetIssueAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="issueId" value={detail.id} />
              <input type="hidden" name="departmentId" value={detail.departmentId} />
              <input
                name="resolutionReason"
                placeholder="Resolution reason"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100" data-testid="resolve-issue">
                Resolve
              </button>
            </form>
            <form action={closeAssetIssueAction}>
              <input type="hidden" name="issueId" value={detail.id} />
              <input type="hidden" name="departmentId" value={detail.departmentId} />
              <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100" data-testid="close-issue">
                Close
              </button>
            </form>
            <form action={reopenAssetIssueAction}>
              <input type="hidden" name="issueId" value={detail.id} />
              <input type="hidden" name="departmentId" value={detail.departmentId} />
              <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100" data-testid="reopen-issue">
                Reopen
              </button>
            </form>
          </div>

          {canChangeStatus ? (
            <form action={updateAssetStatusAction} className="mt-4 flex flex-wrap items-end gap-2">
              <input type="hidden" name="assetId" value={detail.assetId} />
              <input type="hidden" name="departmentId" value={detail.departmentId} />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Update Asset status</span>
                <select name="status" defaultValue="DEGRADED" className="rounded-md border border-zinc-300 px-3 py-2" data-testid="issue-asset-status">
                  <option value="OPERATIONAL">OPERATIONAL</option>
                  <option value="DEGRADED">DEGRADED</option>
                  <option value="OUT_OF_SERVICE">OUT_OF_SERVICE</option>
                </select>
              </label>
              <input name="note" placeholder="Status note" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100">
                Change Asset status
              </button>
            </form>
          ) : null}

          {canManageWo ? (
            <form action={createWorkOrderFromAssetIssueAction} className="mt-4 flex flex-wrap items-end gap-2" data-testid="create-wo-from-issue">
              <input type="hidden" name="issueId" value={detail.id} />
              <input type="hidden" name="departmentId" value={detail.departmentId} />
              {authority.canAssignVendor ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Vendor (optional)</span>
                  <select name="vendorId" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-2" data-testid="wo-vendor">
                    <option value="">No vendor</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white" data-testid="create-work-order">
                Create Work Order
              </button>
            </form>
          ) : null}

          <form action={linkEvidenceToAssetIssueAction} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="issueId" value={detail.id} />
            <input type="hidden" name="departmentId" value={detail.departmentId} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Link evidence record ID</span>
              <input
                name="evidenceRecordId"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                data-testid="link-evidence-id"
              />
            </label>
            <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100">
              Link evidence
            </button>
          </form>
        </section>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Work Order</h2>
        {detail.workOrder ? (
          <Link href={`/issues/${detail.workOrder.id}`} className="mt-2 block text-sm underline underline-offset-2" data-testid="linked-work-order">
            {detail.workOrder.repairCode} · {detail.workOrder.title} ·{" "}
            {workOrderStatusLabel(detail.workOrder.status)}
          </Link>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No Work Order linked. Issue and Work Order remain separate.</p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="issue-evidence-links">
        <h2 className="text-lg font-semibold text-zinc-900">Supporting Evidence</h2>
        {detail.evidenceLinks.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No linked Evidence.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {detail.evidenceLinks.map((link) => (
              <li key={link.id}>
                {link.evidenceRecord.templateName} · {link.evidenceRecord.status} ·{" "}
                {link.evidenceRecord.occurredAt.toLocaleString()}
                {link.evidenceRecord.outOfStandard ? " · Out of standard" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Updates</h2>
        <ol className="mt-3 space-y-2">
          {detail.updates.map((u) => (
            <li key={u.id} className="border-l-2 border-zinc-200 pl-3 text-sm text-zinc-700">
              <p>{u.updateText}</p>
              <p className="text-xs text-zinc-500">
                {u.updatedAt.toLocaleString()}
                {u.statusAfterUpdate ? ` · ${assetIssueStatusLabel(u.statusAfterUpdate)}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

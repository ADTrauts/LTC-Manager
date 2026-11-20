import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { CustomerOffboardingForm } from "@/components/customer-offboarding-form";
import { CustomerOffboardingPlan, CustomerOffboardingHistory } from "@/components/customer-offboarding-plan";
import { assertFacilityAdministratorPage } from "@/lib/facility-admin-guard";
import { prisma } from "@/lib/prisma";
import { loadOffboardingRequest } from "@/lib/customer-offboarding/service";
import { offboardingEnabled, offboardingPlanSchema, OffboardingDenied, OFFBOARDING_NOTICE, OPEN_OFFBOARDING_STATUSES, reviewPage, statusLabel } from "@/lib/customer-offboarding/contract";
import { respondCustomerOffboardingAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function CustomerOffboardingDetail({ params, searchParams }: {
  params: Promise<{ requestId: string }>; searchParams: Promise<{ events?: string }>;
}) {
  if (!offboardingEnabled()) notFound();
  const session = await assertFacilityAdministratorPage();
  const [{ requestId }, q] = await Promise.all([params, searchParams]);
  const data = await loadOffboardingRequest(prisma, { kind: "CUSTOMER", session }, requestId, reviewPage(q.events))
    .catch((error) => { if (error instanceof OffboardingDenied) notFound(); throw error; });
  const row = data.row;
  return <div className="mx-auto max-w-4xl space-y-6">
    <AdminPageHeader title="Your offboarding review" trail={[{ label: "Offboarding review", href: "/admin/offboarding" }, { label: "Request" }]} subtitle={`${row.facility.displayName} · ${OFFBOARDING_NOTICE}`} />
    <Link prefetch={false} href="/admin/offboarding">Back to my requests</Link>
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">{statusLabel[row.status]}</h2>
      <p>Requested planning date: {row.requestedDate} · {row.facilityTimezone}</p><p className="whitespace-pre-wrap break-words">{row.reason}</p>
      <p className="text-sm">Request {row.id} · Plan version {row.planVersion}</p>
    </section>
    {row.plan ? <section className="space-y-4 rounded border p-4"><h2 className="font-semibold">Current shared plan · version {row.planVersion}</h2>
      <p>Dates use {row.facilityTimezone}, recorded when this request was submitted. No automatic cutoff is scheduled.</p>
      <CustomerOffboardingPlan value={row.plan} />
      {row.status === "PLAN_READY" && offboardingPlanSchema.safeParse(row.plan).success ? <CustomerOffboardingForm action={respondCustomerOffboardingAction}>
        <input type="hidden" name="requestId" value={row.id} /><input type="hidden" name="commandId" value={randomUUID()} /><input type="hidden" name="revision" value={row.revision} />
        <label className="flex gap-2"><input type="checkbox" name="reviewed" value="yes" required />I reviewed plan version {row.planVersion}. Acknowledgment records this plan, without executing closure actions.</label>
        <button name="decision" value="ACKNOWLEDGE" className="rounded border px-4 py-2 font-semibold">Acknowledge this plan version</button>
      </CustomerOffboardingForm> : null}
    </section> : <p>The OWNER has not published a plan yet.</p>}
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Existing service facts</h2>
      <p>Operational changes: {row.facility.operationsSuspendedAt ? "Manually paused" : "No manual pause"}. Billing mirror: {row.facility.billing?.status ?? "Not recorded"}.</p>
      <p>Your limited Record exports: {data.exports.pending} pending, {data.exports.approved} currently approved. Approval is not proof of download or a full backup.</p>
      <nav className="flex flex-wrap gap-4"><Link prefetch={false} href="/admin/exports">Review my Record exports</Link><Link prefetch={false} href="/admin/billing">Manage billing</Link><Link prefetch={false} href="/help">Contact Support</Link></nav>
    </section>
    {OPEN_OFFBOARDING_STATUSES.includes(row.status) ? <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Withdraw this request</h2>
      <CustomerOffboardingForm action={respondCustomerOffboardingAction}><input type="hidden" name="requestId" value={row.id} /><input type="hidden" name="commandId" value={randomUUID()} /><input type="hidden" name="revision" value={row.revision} />
        <label className="flex gap-2"><input type="checkbox" name="reviewed" value="yes" required />Withdraw this planning request. Existing billing, access and any operational pause remain as they are.</label>
        <button name="decision" value="WITHDRAW" className="rounded border px-4 py-2">Withdraw request</button>
      </CustomerOffboardingForm>
    </section> : null}
    <section className="space-y-3"><h2 className="font-semibold">Shared request history</h2><CustomerOffboardingHistory events={data.events} />
      <nav aria-label="Request history pages" className="flex gap-4"><span>{data.total} events · page {data.page} of {data.pages}</span>
        {data.page > 1 ? <Link prefetch={false} href={`?events=${data.page - 1}`}>Previous</Link> : null}{data.page < data.pages ? <Link prefetch={false} href={`?events=${data.page + 1}`}>Next</Link> : null}
      </nav>
    </section>
  </div>;
}

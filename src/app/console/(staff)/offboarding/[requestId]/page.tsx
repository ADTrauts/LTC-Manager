import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerOffboardingForm } from "@/components/customer-offboarding-form";
import { CustomerOffboardingPlan, CustomerOffboardingHistory } from "@/components/customer-offboarding-plan";
import { requireHarborOwner } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { loadOffboardingRequest } from "@/lib/customer-offboarding/service";
import { offboardingEnabled, offboardingPlanSchema, OffboardingDenied, OFFBOARDING_NOTICE, OPEN_OFFBOARDING_STATUSES,
  PLAN_TOPICS, reviewPage, SHARED_TEXT_NOTICE, statusLabel } from "@/lib/customer-offboarding/contract";
import { supportFacilityTicketsHref } from "@/lib/support/history";
import { reviewCustomerOffboardingAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function OwnerOffboardingDetail({ params, searchParams }: {
  params: Promise<{ requestId: string }>; searchParams: Promise<{ events?: string }>;
}) {
  if (!offboardingEnabled()) notFound();
  const session = await requireHarborOwner();
  const [{ requestId }, q] = await Promise.all([params, searchParams]);
  const data = await loadOffboardingRequest(prisma, { kind: "OWNER", session }, requestId, reviewPage(q.events))
    .catch((error) => { if (error instanceof OffboardingDenied) notFound(); throw error; });
  const row = data.row;
  const open = OPEN_OFFBOARDING_STATUSES.includes(row.status);
  const plan = offboardingPlanSchema.safeParse(row.plan);
  const customerHref = `/console/customers/${encodeURIComponent(row.facilityId)}`;
  return <div className="mx-auto max-w-5xl space-y-6">
    <header className="space-y-2"><Link prefetch={false} href="/console/offboarding">Back to offboarding reviews</Link>
      <h1 className="text-2xl font-semibold">{row.facility.displayName} · offboarding review</h1><p>{OFFBOARDING_NOTICE}</p>
      <p>{SHARED_TEXT_NOTICE}</p></header>
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">{statusLabel[row.status]}</h2>
      <p>Requested by {row.requesterLabel} · {row.createdAt.toISOString()} UTC</p>
      <p>Requested planning date: {row.requestedDate} · {row.facilityTimezone}</p><p className="whitespace-pre-wrap break-words">{row.reason}</p>
      <p>{data.requesterCurrent ? "The requester currently holds the Administrator seat." : "The requester no longer holds the current Administrator seat. A fresh request from the current Administrator is required."}</p>
    </section>
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Current source facts</h2>
      <p>Operational pause: {row.facility.operationsSuspendedAt ? "Paused" : "No manual pause"}. Billing mirror: {row.facility.billing?.status ?? "Not recorded"}.</p>
      <p>Requester’s limited exports: {data.exports.pending} pending, {data.exports.approved} currently approved. Approval is not proof of download or a full backup.</p>
      <nav className="flex flex-wrap gap-4">
        <Link prefetch={false} href={`${customerHref}/lifecycle#operational-pause`}>Review existing operational pause</Link>
        <Link prefetch={false} href={`${customerHref}#billing`}>Review billing</Link>
        <Link prefetch={false} href="/console/exports">Review export requests</Link>
        <Link prefetch={false} href={supportFacilityTicketsHref(row.facilityId)}>Review Support</Link>
      </nav><p className="text-sm">Facts are current local metadata, separate from the recorded plan. No provider request runs on this page.</p>
    </section>
    {row.plan ? <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Current plan · version {row.planVersion}</h2><CustomerOffboardingPlan value={row.plan} /></section> : null}
    {open && data.requesterCurrent ? <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Publish {row.planVersion ? "a revised" : "a first"} shared plan</h2>
      <p>Publishing creates a new version and requires fresh Administrator acknowledgment. Dates use the request’s recorded timezone, {row.facilityTimezone}. No automatic cutoff is scheduled.</p>
      <CustomerOffboardingForm key={`plan-${row.revision}`} action={reviewCustomerOffboardingAction}>
        <input type="hidden" name="commandId" value={randomUUID()} /><input type="hidden" name="requestId" value={row.id} /><input type="hidden" name="revision" value={row.revision} />
        <label className="block">Target planning date<input name="targetDate" type="date" required defaultValue={plan.success ? plan.data.targetDate : row.requestedDate} className="block rounded border p-2" /></label>
        {PLAN_TOPICS.map(({ key, label }) => <fieldset key={key} className="space-y-2 rounded border p-3"><legend className="font-semibold">{label}</legend>
          <label className="block">Shared plan notes<textarea name={`${key}Notes`} defaultValue={plan.success ? plan.data[key].notes : ""} minLength={8} maxLength={1500} required rows={3} className="block w-full rounded border p-2" /></label>
          <label className="flex gap-2"><input type="checkbox" name={`${key}Reviewed`} value="yes" defaultChecked={plan.success ? plan.data[key].reviewed : false} />I reviewed this part of the plan. This does not mark the service action executed.</label>
        </fieldset>)}
        <label className="flex gap-2"><input name="reviewed" type="checkbox" value="yes" required />I reviewed the full shared plan and target date. Publishing only records the plan.</label>
        <button name="decision" value="PUBLISH_PLAN" className="rounded border px-4 py-2 font-semibold">Publish for Administrator acknowledgment</button>
      </CustomerOffboardingForm>
    </section> : null}
    {open ? <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Decline or resolve a stale request</h2>
      <CustomerOffboardingForm action={reviewCustomerOffboardingAction}>
        <input type="hidden" name="commandId" value={randomUUID()} /><input type="hidden" name="requestId" value={row.id} /><input type="hidden" name="revision" value={row.revision} />
        <label className="block">Reason shared with the requester<textarea name="reason" minLength={8} maxLength={1500} required rows={3} className="block w-full rounded border p-2" /></label>
        <label className="flex gap-2"><input name="reviewed" type="checkbox" value="yes" required />I reviewed this decision. It changes only this planning request.</label>
        <button name="decision" value="DECLINE" className="rounded border px-4 py-2">Decline request</button>
      </CustomerOffboardingForm>
    </section> : null}
    <section className="space-y-3"><h2 className="font-semibold">Shared revision history</h2><CustomerOffboardingHistory events={data.events} />
      <nav aria-label="Review history pages" className="flex gap-4"><span>{data.total} events · page {data.page} of {data.pages}</span>
        {data.page > 1 ? <Link prefetch={false} href={`?events=${data.page - 1}`}>Previous</Link> : null}{data.page < data.pages ? <Link prefetch={false} href={`?events=${data.page + 1}`}>Next</Link> : null}
      </nav>
    </section>
  </div>;
}

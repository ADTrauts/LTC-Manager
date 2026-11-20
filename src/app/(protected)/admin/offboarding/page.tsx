import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { CustomerOffboardingForm } from "@/components/customer-offboarding-form";
import { assertFacilityAdministratorPage } from "@/lib/facility-admin-guard";
import { prisma } from "@/lib/prisma";
import { listOffboardingRequests } from "@/lib/customer-offboarding/service";
import { offboardingEnabled, OffboardingDenied, OFFBOARDING_NOTICE, reviewPage, SHARED_TEXT_NOTICE, statusLabel } from "@/lib/customer-offboarding/contract";
import { requestCustomerOffboardingAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CustomerOffboardingPage({ searchParams }: { searchParams: Promise<{ page?: string; view?: string }> }) {
  if (!offboardingEnabled()) notFound();
  const session = await assertFacilityAdministratorPage();
  const q = await searchParams;
  const openOnly = q.view === "open";
  const data = await listOffboardingRequests(prisma, { kind: "CUSTOMER", session }, reviewPage(q.page), undefined, openOnly)
    .catch((error) => { if (error instanceof OffboardingDenied) notFound(); throw error; });
  return <div className="mx-auto max-w-4xl space-y-6">
    <AdminPageHeader title="Customer offboarding review" trail={[{ label: "Offboarding review" }]} subtitle={`${data.facilityName} · ${OFFBOARDING_NOTICE}`} />
    <section className="space-y-3 rounded border p-4">
      <h2 className="font-semibold">Request an offboarding plan</h2><p>{SHARED_TEXT_NOTICE}</p>
      {data.facilityHasOpen ? <p>This Facility already has an open request. Continue your request below, or contact Support to resolve an earlier Administrator’s request.</p> :
        <CustomerOffboardingForm action={requestCustomerOffboardingAction}>
          <input type="hidden" name="id" value={randomUUID()} />
          <label className="block">Requested planning date<input name="requestedDate" type="date" required className="block rounded border p-2" /></label>
          <label className="block">Reason for the review<textarea name="reason" minLength={8} maxLength={1000} required rows={4} className="block w-full rounded border p-2" /></label>
          <label className="flex gap-2"><input name="reviewed" value="yes" type="checkbox" required />I am requesting a review. This does not automatically close service or change billing, access or data.</label>
          <button className="rounded border px-4 py-2 font-semibold">Request OWNER review</button>
        </CustomerOffboardingForm>}
    </section>
    <section className="space-y-3"><h2 className="font-semibold">My requests</h2>
      <nav aria-label="Request filters" className="flex gap-4"><Link prefetch={false} href="/admin/offboarding">All requests</Link><Link prefetch={false} href="/admin/offboarding?view=open">Open requests</Link></nav>
      {data.rows.map((row) => <article key={row.id} className="space-y-2 rounded border p-4">
        <h3 className="font-semibold"><Link prefetch={false} href={`/admin/offboarding/${row.id}`}>Review request from {row.createdAt.toISOString().slice(0, 10)}</Link></h3>
        <p>{statusLabel[row.status]}</p><p>Requested planning date: {row.requestedDate} · {row.facilityTimezone}</p>
      </article>)}
      {!data.rows.length ? <p>No matching requests.</p> : null}
      <nav aria-label="Offboarding request pages" className="flex gap-4"><span>{data.total} requests · page {data.page} of {data.pages}</span>
        {data.page > 1 ? <Link prefetch={false} href={`?view=${openOnly ? "open" : "all"}&page=${data.page - 1}`}>Previous</Link> : null}
        {data.page < data.pages ? <Link prefetch={false} href={`?view=${openOnly ? "open" : "all"}&page=${data.page + 1}`}>Next</Link> : null}
      </nav>
    </section>
    <nav aria-label="Existing customer services" className="flex flex-wrap gap-4">
      <Link prefetch={false} href="/admin/exports">Requested Record exports</Link><Link prefetch={false} href="/admin/billing">Billing</Link><Link prefetch={false} href="/help">Support</Link>
    </nav>
  </div>;
}

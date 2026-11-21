import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHarborOwner } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { listOffboardingRequests } from "@/lib/customer-offboarding/service";
import { offboardingEnabled, OFFBOARDING_NOTICE, reviewPage, statusLabel } from "@/lib/customer-offboarding/contract";

export const dynamic = "force-dynamic";

export default async function OwnerOffboardingPage({ searchParams }: { searchParams: Promise<{ page?: string; view?: string; facilityId?: string }> }) {
  if (!offboardingEnabled()) notFound();
  const session = await requireHarborOwner();
  const q = await searchParams;
  const facilityId = typeof q.facilityId === "string" && q.facilityId.length <= 128 ? q.facilityId : undefined;
  const openOnly = q.view !== "all";
  const data = await listOffboardingRequests(prisma, { kind: "OWNER", session }, reviewPage(q.page), facilityId, openOnly);
  const href = (page: number, view = openOnly ? "open" : "all") => `?${new URLSearchParams({ page: String(page), view, ...(facilityId ? { facilityId } : {}) })}`;
  return <div className="mx-auto max-w-5xl space-y-6">
    <header className="space-y-2"><h1 className="text-2xl font-semibold">Customer offboarding reviews</h1><p>{OFFBOARDING_NOTICE}</p>
      <p>OWNER review of coordination only. Customer data, billing changes and access commands remain in their existing authorized flows.</p></header>
    <nav aria-label="Review filters" className="flex gap-4"><Link prefetch={false} href={href(1, "open")}>Open requests</Link><Link prefetch={false} href={href(1, "all")}>All requests</Link>
      {facilityId ? <Link prefetch={false} href="/console/offboarding">All Facilities</Link> : null}</nav>
    {data.rows.map((row) => <article key={row.id} className="space-y-2 rounded border p-4">
      <h2 className="font-semibold"><Link prefetch={false} href={`/console/offboarding/${row.id}`}>{row.facility.displayName} · {row.requesterLabel}</Link></h2>
      <p>{statusLabel[row.status]}</p><p>Requested planning date: {row.requestedDate} · {row.facilityTimezone}</p>
      <p className="text-sm">Requested {row.createdAt.toISOString()} UTC</p>
    </article>)}
    {!data.rows.length ? <p>No matching requests.</p> : null}
    <nav aria-label="Offboarding review pages" className="flex gap-4"><span>{data.total} requests · page {data.page} of {data.pages}</span>
      {data.page > 1 ? <Link prefetch={false} href={href(data.page - 1)}>Previous</Link> : null}{data.page < data.pages ? <Link prefetch={false} href={href(data.page + 1)}>Next</Link> : null}
    </nav>
  </div>;
}

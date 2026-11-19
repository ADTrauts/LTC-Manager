import Link from "next/link";
import { requireHarborOwner } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { listOwnerExports, SCOPE_NOTICE } from "@/lib/customer-record-exports/service";
import { EXPORT_COLUMNS } from "@/lib/customer-record-exports/manifest";
import { CustomerExportActionForm } from "@/components/customer-export-action-form";
import { reviewRecordExportAction } from "./actions";
import { exportDataListSchema } from "@/lib/customer-record-exports/data-list";
export const dynamic = "force-dynamic";
export default async function OwnerExportsPage({ searchParams }: {
    searchParams: Promise<{
        page?: string;
    }>;
}) {
    const s = await requireHarborOwner();
    const q = await searchParams;
    const page = typeof q.page === "string" && /^\d{1,6}$/.test(q.page) ? Math.max(1, Number(q.page)) : 1;
    const data = await listOwnerExports(prisma, s, page);
    return <div className="mx-auto max-w-5xl space-y-6"><header><h1 className="text-2xl font-semibold">Customer export requests</h1><p>{SCOPE_NOTICE}</p><p>Review the requested scope. This screen grants no access to report responses, files or the customer workspace.</p></header>
 <details><summary>Approved manifest, version 1</summary><p>{EXPORT_COLUMNS.join(", ")}. Files also include the approved scope, request reference, generation time and Record count. Current persisted responses only; no expected/missed-work calculation. Maximum 93 days, 2,000 Records and 50,000 responses and a 4 MB file.</p></details>
 {data.rows.map(row => <article key={row.id} className="space-y-3 rounded border p-4"><h2 className="font-semibold">{row.requesterLabel} · {row.recordKey}</h2><Link prefetch={false} className="underline" href={`/console/customers/${row.facilityId}`}>{row.facilityName}</Link><dl><dt>Request reference</dt><dd>{row.id}</dd><dt>Department</dt><dd>{row.departmentName}</dd><dt>Service dates</dt><dd>{row.fromDate} through {row.toDate}</dd><dt>Format</dt><dd>{row.format.toUpperCase()}</dd><dt>Status</dt><dd>{row.status}{row.expiresAt ? ` · Expires ${row.expiresAt.toISOString()}` : ""}</dd></dl>
 <details><summary>Requested field list</summary><ul>{exportDataListSchema.parse(row.dataList).map(d => <li key={d.id}>{d.name} · version {d.version}<ul>{d.fields.map(f => <li key={`${f.group}:${f.key}`}>{f.label} ({f.type}{f.unit ? `, ${f.unit}` : ""})</li>)}</ul></li>)}</ul></details>
        {row.status === "PENDING" || row.status === "APPROVED" ? <CustomerExportActionForm action={reviewRecordExportAction}><input type="hidden" name="id" value={row.id}/><input type="hidden" name="revision" value={row.revision}/><label className="block"><input type="checkbox" name="reviewed" value="yes" required/> I reviewed this request’s data list, dates, format and recipient.</label>
 {row.status === "PENDING" ? <div className="flex gap-4"><button name="decision" value="APPROVED" className="rounded border px-4 py-2">Approve for 24 hours</button><button name="decision" value="DENIED" className="rounded border px-4 py-2">Deny</button></div> : <button name="decision" value="REVOKED" className="rounded border px-4 py-2">Revoke further downloads</button>}</CustomerExportActionForm> : null}</article>)}
 {!data.rows.length ? <p>No customer export requests.</p> : null}<nav aria-label="Export request pagination" className="flex gap-4"><span>{data.total} requests · page {data.page} of {data.pages}</span>{data.page > 1 ? <Link prefetch={false} href={`?page=${data.page - 1}`}>Previous</Link> : null}{data.page < data.pages ? <Link prefetch={false} href={`?page=${data.page + 1}`}>Next</Link> : null}</nav></div>;
}

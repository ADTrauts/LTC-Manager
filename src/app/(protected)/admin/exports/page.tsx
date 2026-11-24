import { randomUUID } from "node:crypto";
import Link from "next/link";
import { assertFacilityAdministratorPage } from "@/lib/facility-admin-guard";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireExportCustomer, listCustomerExports, SCOPE_NOTICE } from "@/lib/customer-record-exports/service";
import { EXPORT_COLUMNS } from "@/lib/customer-record-exports/manifest";
import { CustomerExportActionForm } from "@/components/customer-export-action-form";
import { requestRecordExportAction, cancelRecordExportAction } from "./actions";
export const dynamic = "force-dynamic";
const pageNumber = (v: unknown) => typeof v === "string" && /^\d{1,6}$/.test(v) ? Math.max(1, Number(v)) : 1;
export default async function CustomerExportsPage({ searchParams }: {
    searchParams: Promise<{
        page?: string;
        records?: string;
    }>;
}) {
    await assertFacilityAdministratorPage();
    const s = (await getSession())!;
    const query = await searchParams;
    const data = await listCustomerExports(prisma, s, pageNumber(query.page));
    const choices = await prisma.$transaction(async (tx) => {
        await requireExportCustomer(tx, s);
        const where = {
            facilityId: s.facilityId, catalogDefinition: {
                OR: [{
                        ownerKind: "VSSYL" as const
                    }, {
                        ownerKind: "FACILITY" as const, ownerFacilityId: s.facilityId
                    }]
            }
        };
        const total = await tx.logAttachment.count({
            where
        });
        const page = Math.min(pageNumber(query.records), Math.ceil(total / 25) || 1);
        const rows = await tx.logAttachment.findMany({
            where, orderBy: {
                id: "asc"
            }, skip: (page - 1) * 25, take: 25, select: {
                id: true, departmentId: true, department: {
                    select: {
                        name: true
                    }
                }, catalogDefinition: {
                    select: {
                        stableKey: true, name: true
                    }
                }
            }
        });
        await requireExportCustomer(tx, s);
        return {
            rows, total, page, pages: Math.ceil(total / 25) || 1
        };
    });
    return <div className="mx-auto max-w-4xl space-y-6"><header><h1 className="text-2xl font-semibold">Requested Record exports</h1><p>{SCOPE_NOTICE}</p></header>
 <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Request a report</h2><p>Choose a range with existing Records. Exports contain persisted Record responses, including operational attribution and corrective action. They do not calculate missing or expected work. Approval pins the requested form versions and field list. A new version requires a new request. Ownership is checked across every requested date; unknown or vendor periods require a different scope.</p>
 <details><summary>Included data columns</summary><p>{EXPORT_COLUMNS.join(", ")}. Each file also contains its scope, request reference, generation time and Record count.</p></details>
 {choices.rows.length ? <CustomerExportActionForm action={requestRecordExportAction}><input name="id" type="hidden" value={randomUUID()}/>
 <label className="block">Department and Record<select name="scope" required className="block w-full rounded border p-2">{choices.rows.map(c => <option key={c.id} value={JSON.stringify({
            departmentId: c.departmentId, recordKey: c.catalogDefinition.stableKey
        })}>{c.department.name} — {c.catalogDefinition.name}</option>)}</select></label>
 <div className="flex flex-wrap gap-4"><label>From service date<input className="block rounded border p-2" name="fromDate" type="date" required/></label><label>Through service date<input className="block rounded border p-2" name="toDate" type="date" required/></label><label>Format<select className="block rounded border p-2" name="format"><option value="csv">CSV</option><option value="xlsx">Excel</option></select></label></div>
 <p>Choose up to 93 service days. Reports are limited to 2,000 Records and 50,000 text/numeric responses and a 4 MB file; narrow the range if needed.</p><button className="rounded border px-4 py-2 font-semibold">Request OWNER approval</button></CustomerExportActionForm> : <p>No platform or Facility-owned Records are currently attached to this Facility.</p>}
 <nav aria-label="Available Record pagination" className="flex gap-4"><span>{choices.total} Library entries · page {choices.page} of {choices.pages}</span>{choices.page > 1 ? <Link prefetch={false} href={`?records=${choices.page - 1}`}>Previous Records</Link> : null}{choices.page < choices.pages ? <Link prefetch={false} href={`?records=${choices.page + 1}`}>Next Records</Link> : null}</nav></section>
 <section className="space-y-4"><h2 className="font-semibold">My requests</h2>{data.rows.map(row => <article key={row.id} className="space-y-3 rounded border p-4"><h3 className="font-semibold">{row.recordKey} · {row.fromDate} through {row.toDate} · {row.format.toUpperCase()}</h3><p>Request {row.id}</p><p>{row.status === "APPROVED" && row.expiresAt && +row.expiresAt <= data.evaluatedAt ? "EXPIRED — submit a new request" : row.status}{row.expiresAt ? ` · Approval expires ${row.expiresAt.toISOString()}` : ""}</p>
 {row.status === "APPROVED" && row.expiresAt && +row.expiresAt > data.evaluatedAt ? <form method="post" action={`/api/customer-exports/${row.id}/download`}><button className="rounded border px-4 py-2">Generate and download approved report</button></form> : null}
 {row.status === "PENDING" || row.status === "APPROVED" ? <CustomerExportActionForm action={cancelRecordExportAction}><input type="hidden" name="id" value={row.id}/><button className="underline">Cancel request and further downloads</button></CustomerExportActionForm> : null}</article>)}{!data.rows.length ? <p>No requests yet.</p> : null}
 <nav aria-label="Request pagination" className="flex gap-4"><span>{data.total} requests · page {data.page} of {data.pages}</span>{data.page > 1 ? <Link prefetch={false} href={`?page=${data.page - 1}`}>Previous requests</Link> : null}{data.page < data.pages ? <Link prefetch={false} href={`?page=${data.page + 1}`}>Next requests</Link> : null}</nav>
 <p>Generation receipts record the file hash, size and Record count. A receipt does not prove the browser received or retained a file. Cancelling access cannot recall a copy already downloaded.</p></section></div>;
}

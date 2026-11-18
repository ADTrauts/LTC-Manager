import Link from "next/link";
import { redirect } from "next/navigation";

import { ACCOUNT_INVITE_STATUS_LABEL } from "@/lib/account-invite/status";
import { loadHarborAdministratorInvitationFollowUp } from "@/lib/harbor-console/administrator-invitation-followup";
import { requireHarborOwner } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";

const path = "/console/customers/invitation-follow-up";
const pageHref = (page: number) => page === 1 ? path : `${path}?page=${page}`;
const pageLink = "inline-flex min-h-11 items-center rounded-md border border-[var(--border)] bg-white px-3 hover:text-[var(--foreground)]";

export default async function HarborInvitationFollowUpPage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const owner = await requireHarborOwner();
  const result = await loadHarborAdministratorInvitationFollowUp(prisma, owner, (await searchParams).page);
  if (!result) redirect("/console/customers");
  const { rows, total, offset, page, pageCount } = result;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <Link href="/console/customers" className="text-sm font-medium underline underline-offset-2">Customers</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Administrator invitation follow-up</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Facilities whose current Administrator has no password and no valid unused account invite.
        </p>
      </header>
      {rows.length ? (
        <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Facility</th>
                <th scope="col" className="px-4 py-2 font-medium">Organization</th>
                <th scope="col" className="px-4 py-2 font-medium">Invitation state</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.facilityId} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-4 py-3">
                    <Link href={`/console/customers/${row.facilityId}#administrator-activation`} prefetch={false} className="font-medium underline underline-offset-2">
                      {row.facilityName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{row.organizationLabel}</td>
                  <td className="px-4 py-3">{ACCOUNT_INVITE_STATUS_LABEL[row.invitationState]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-md border border-[var(--border)] bg-white px-4 py-6 text-sm text-[var(--text-secondary)]">
          No Facilities need Administrator invitation follow-up.
        </p>
      )}
      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
          <p>Showing {offset + 1}–{offset + rows.length} of {total} {total === 1 ? "facility" : "facilities"}</p>
          {pageCount > 1 ? (
            <nav aria-label="Invitation follow-up pages" className="flex items-center gap-2">
              {page > 1 ? <Link href={pageHref(page - 1)} rel="prev" className={pageLink}>Previous</Link> : null}
              <span>Page {page} of {pageCount}</span>
              {page < pageCount ? <Link href={pageHref(page + 1)} rel="next" className={pageLink}>Next</Link> : null}
            </nav>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

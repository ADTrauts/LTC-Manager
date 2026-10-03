import Link from "next/link";

import {
  createSupportTagAction,
  renameSupportTagAction,
  setSupportTagActiveAction,
} from "@/app/console/(staff)/tickets/actions";
import { SupportSubmitButton } from "@/components/harbor-console/support-submit-button";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { isSupportTicketErrorCode, SUPPORT_TICKET_ERROR_MESSAGE } from "@/lib/support/errors";
import { listSupportTags } from "@/lib/support/tags";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm";

export default async function SupportTagsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireHarborStaff();
  const [{ error }, tags] = await Promise.all([searchParams, listSupportTags(prisma)]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm">
          <Link href="/console/tickets" className="text-[var(--text-secondary)] hover:underline">
            Tickets
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Tags</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Topics for a ticket (reporting, billing, export). Type still answers what kind of request
          it is. Names are unique ignoring case. Deactivate instead of deleting.
        </p>
      </header>

      {isSupportTicketErrorCode(error) ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {SUPPORT_TICKET_ERROR_MESSAGE[error]}
        </p>
      ) : null}

      <form action={createSupportTagAction} className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold">New tag</h2>
        <label className="block text-sm">
          <span className="font-medium">Name</span>
          <input name="name" required maxLength={40} className={INPUT_CLASS} />
        </label>
        <SupportSubmitButton pendingLabel="Saving…">Create</SupportSubmitButton>
      </form>

      <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tags.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-[var(--text-secondary)]">
                  No tags yet.
                </td>
              </tr>
            ) : (
              tags.map((tag) => (
                <tr key={tag.id} className="border-b border-[var(--border)] last:border-b-0 align-top">
                  <td className="px-4 py-3">
                    <form action={renameSupportTagAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={tag.id} />
                      <label className="block min-w-[10rem] flex-1 text-sm">
                        <span className="sr-only">Rename {tag.name}</span>
                        <input
                          name="name"
                          required
                          maxLength={40}
                          defaultValue={tag.name}
                          className={INPUT_CLASS}
                        />
                      </label>
                      <SupportSubmitButton pendingLabel="Saving…" variant="secondary">
                        Rename
                      </SupportSubmitButton>
                    </form>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{tag.normalizedName}</p>
                  </td>
                  <td className="px-4 py-3">{tag.isActive ? "Active" : "Inactive"}</td>
                  <td className="px-4 py-3">
                    <form action={setSupportTagActiveAction}>
                      <input type="hidden" name="id" value={tag.id} />
                      <input type="hidden" name="isActive" value={tag.isActive ? "false" : "true"} />
                      <SupportSubmitButton pendingLabel="Saving…" variant="secondary">
                        {tag.isActive ? "Deactivate" : "Reactivate"}
                      </SupportSubmitButton>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

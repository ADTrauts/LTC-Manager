import Link from "next/link";

import {
  createSupportSavedReplyAction,
  setSupportSavedReplyActiveAction,
  updateSupportSavedReplyAction,
} from "@/app/console/(staff)/tickets/actions";
import { SupportSubmitButton } from "@/components/harbor-console/support-submit-button";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { isSupportTicketErrorCode, SUPPORT_TICKET_ERROR_MESSAGE } from "@/lib/support/errors";
import { listSupportSavedReplies, SUPPORT_SAVED_REPLY_VARIABLES } from "@/lib/support/saved-replies";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm";

export default async function SupportSavedRepliesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireHarborStaff();
  const [{ error }, replies] = await Promise.all([searchParams, listSupportSavedReplies(prisma)]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm">
          <Link href="/console/tickets" className="text-[var(--text-secondary)] hover:underline">
            Tickets
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Saved replies</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Shared templates for Harbor staff. Inserting one copies text into the reply draft. Nothing
          sends, changes status, or assigns a ticket.
        </p>
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          Optional variables: {SUPPORT_SAVED_REPLY_VARIABLES.map((name) => `{{${name}}}`).join(" ")}
        </p>
      </header>

      {isSupportTicketErrorCode(error) ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {SUPPORT_TICKET_ERROR_MESSAGE[error]}
        </p>
      ) : null}

      <form action={createSupportSavedReplyAction} className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold">New saved reply</h2>
        <label className="block text-sm">
          <span className="font-medium">Name</span>
          <input name="name" required maxLength={80} className={INPUT_CLASS} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Body</span>
          <textarea name="body" required maxLength={8000} rows={5} className={INPUT_CLASS} />
        </label>
        <SupportSubmitButton pendingLabel="Saving…">Create</SupportSubmitButton>
      </form>

      <div className="space-y-4">
        {replies.length === 0 ? (
          <p className="rounded-md border border-[var(--border)] bg-white px-4 py-6 text-sm text-[var(--text-secondary)]">
            No saved replies yet.
          </p>
        ) : (
          replies.map((reply) => (
            <article key={reply.id} className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
              <form action={updateSupportSavedReplyAction} className="space-y-3">
                <input type="hidden" name="id" value={reply.id} />
                <div className="flex items-center justify-between gap-3">
                  <label className="block flex-1 text-sm">
                    <span className="font-medium">Name</span>
                    <input
                      name="name"
                      required
                      maxLength={80}
                      defaultValue={reply.name}
                      className={INPUT_CLASS}
                    />
                  </label>
                  <p className="self-end pb-2 text-xs text-[var(--text-secondary)]">
                    {reply.isActive ? "Active" : "Inactive"}
                  </p>
                </div>
                <label className="block text-sm">
                  <span className="font-medium">Body</span>
                  <textarea
                    name="body"
                    required
                    maxLength={8000}
                    rows={5}
                    defaultValue={reply.body}
                    className={INPUT_CLASS}
                  />
                </label>
                <SupportSubmitButton pendingLabel="Saving…" variant="secondary">
                  Save
                </SupportSubmitButton>
              </form>
              <form action={setSupportSavedReplyActiveAction}>
                <input type="hidden" name="id" value={reply.id} />
                <input type="hidden" name="isActive" value={reply.isActive ? "false" : "true"} />
                <SupportSubmitButton pendingLabel="Saving…" variant="secondary">
                  {reply.isActive ? "Deactivate" : "Reactivate"}
                </SupportSubmitButton>
              </form>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

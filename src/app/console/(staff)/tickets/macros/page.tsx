import Link from "next/link";

import {
  createSupportMacroAction,
  setSupportMacroActiveAction,
  updateSupportMacroAction,
} from "@/app/console/(staff)/tickets/actions";
import { SupportSubmitButton } from "@/components/harbor-console/support-submit-button";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { isSupportTicketErrorCode, SUPPORT_TICKET_ERROR_MESSAGE } from "@/lib/support/errors";
import {
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_PRIORITY_LABEL,
  SUPPORT_TICKET_STATUS_LABEL,
  SUPPORT_TICKET_TYPE_LABEL,
  SUPPORT_TICKET_TYPES,
} from "@/lib/support/labels";
import {
  describeSupportMacroActions,
  listSupportMacros,
  type SupportMacroRecord,
} from "@/lib/support/macros";
import { listSupportSavedReplies } from "@/lib/support/saved-replies";
import { SUPPORT_TICKET_STATUSES } from "@/lib/support/status-transition";
import { listSupportTags } from "@/lib/support/tags";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm";

export default async function SupportMacrosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireHarborStaff();
  const [{ error }, macros, replies, tags, staff] = await Promise.all([
    searchParams,
    listSupportMacros(prisma),
    listSupportSavedReplies(prisma),
    listSupportTags(prisma),
    prisma.platformStaff.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm">
          <Link href="/console/tickets" className="text-[var(--text-secondary)] hover:underline">
            Tickets
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Macros</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Reusable operator action bundles. Applying a Macro prepares the ticket and draft. It never
          sends email. Saved Replies remain the reusable message text.
        </p>
      </header>

      {isSupportTicketErrorCode(error) ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {SUPPORT_TICKET_ERROR_MESSAGE[error]}
        </p>
      ) : null}

      <MacroForm
        action={createSupportMacroAction}
        replies={replies}
        tags={tags}
        staff={staff}
        submitLabel="Create"
      />

      <div className="space-y-4">
        {macros.length === 0 ? (
          <p className="rounded-md border border-[var(--border)] bg-white px-4 py-6 text-sm text-[var(--text-secondary)]">
            No macros yet.
          </p>
        ) : (
          macros.map((macro) => (
            <article key={macro.id} className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
              <p className="text-xs text-[var(--text-secondary)]">
                {macro.isActive ? "Active" : "Inactive"} · {describeSupportMacroActions(macro).join(" · ")}
              </p>
              <MacroForm
                action={updateSupportMacroAction}
                macro={macro}
                replies={replies}
                tags={tags}
                staff={staff}
                submitLabel="Save"
              />
              <form action={setSupportMacroActiveAction}>
                <input type="hidden" name="id" value={macro.id} />
                <input type="hidden" name="isActive" value={macro.isActive ? "false" : "true"} />
                <SupportSubmitButton pendingLabel="Saving…" variant="secondary">
                  {macro.isActive ? "Deactivate" : "Reactivate"}
                </SupportSubmitButton>
              </form>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function MacroForm({
  action,
  macro,
  replies,
  tags,
  staff,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  macro?: SupportMacroRecord;
  replies: { id: string; name: string; isActive: boolean }[];
  tags: { id: string; name: string; isActive: boolean }[];
  staff: { id: string; displayName: string }[];
  submitLabel: string;
}) {
  const selectableReplies = replies.filter((reply) => reply.isActive || reply.id === macro?.savedReplyId);
  const selectableTags = tags.filter((tag) => tag.isActive || macro?.tagIds.includes(tag.id));
  return (
    <form action={action} className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
      {macro ? <input type="hidden" name="id" value={macro.id} /> : <h2 className="text-sm font-semibold">New macro</h2>}
      <label className="block text-sm">
        <span className="font-medium">Name</span>
        <input name="name" required maxLength={80} defaultValue={macro?.name ?? ""} className={INPUT_CLASS} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Description</span>
        <input name="description" maxLength={240} defaultValue={macro?.description ?? ""} className={INPUT_CLASS} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Saved reply</span>
        <select name="savedReplyId" defaultValue={macro?.savedReplyId ?? ""} className={INPUT_CLASS}>
          <option value="">No reply text</option>
          {selectableReplies.map((reply) => (
            <option key={reply.id} value={reply.id}>
              {reply.name}
              {reply.isActive ? "" : " (inactive)"}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Immediate status</span>
          <select name="status" defaultValue={macro?.status ?? ""} className={INPUT_CLASS}>
            <option value="">No change</option>
            {SUPPORT_TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SUPPORT_TICKET_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Status after reply</span>
          <select name="statusAfterReply" defaultValue={macro?.statusAfterReply ?? ""} className={INPUT_CLASS}>
            <option value="">No change</option>
            {SUPPORT_TICKET_STATUSES.filter((status) => status !== "CLOSED").map((status) => (
              <option key={status} value={status}>
                {SUPPORT_TICKET_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Type</span>
          <select name="type" defaultValue={macro?.type ?? ""} className={INPUT_CLASS}>
            <option value="">No change</option>
            {SUPPORT_TICKET_TYPES.map((type) => (
              <option key={type} value={type}>
                {SUPPORT_TICKET_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Priority</span>
          <select name="priority" defaultValue={macro?.priority ?? ""} className={INPUT_CLASS}>
            <option value="">No change</option>
            {SUPPORT_TICKET_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {SUPPORT_TICKET_PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Assignment</span>
          <select name="assignmentMode" defaultValue={macro?.assignmentMode ?? "UNCHANGED"} className={INPUT_CLASS}>
            <option value="UNCHANGED">No change</option>
            <option value="ME">Assign to me</option>
            <option value="STAFF">Assign to staff</option>
            <option value="UNASSIGN">Unassign</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Specific staff</span>
          <select name="assignedStaffId" defaultValue={macro?.assignedStaffId ?? ""} className={INPUT_CLASS}>
            <option value="">—</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="text-sm">
        <legend className="font-medium">Add tags</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {selectableTags.length === 0 ? (
            <p className="text-[var(--text-secondary)]">No tags yet.</p>
          ) : (
            selectableTags.map((tag) => (
              <label key={tag.id} className="inline-flex items-center gap-1">
                {!tag.isActive && macro?.tagIds.includes(tag.id) ? (
                  <input type="hidden" name="tagIds" value={tag.id} />
                ) : null}
                <input
                  type="checkbox"
                  name="tagIds"
                  value={tag.id}
                  defaultChecked={macro?.tagIds.includes(tag.id) ?? false}
                  disabled={!tag.isActive}
                />
                {tag.name}
                {tag.isActive ? "" : " (inactive)"}
              </label>
            ))
          )}
        </div>
      </fieldset>
      <SupportSubmitButton pendingLabel="Saving…">{submitLabel}</SupportSubmitButton>
    </form>
  );
}

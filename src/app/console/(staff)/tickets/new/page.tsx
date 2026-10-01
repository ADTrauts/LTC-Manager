import { createSupportTicketAction } from "@/app/console/(staff)/tickets/actions";
import { SupportSubmitButton } from "@/components/harbor-console/support-submit-button";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { isSupportTicketErrorCode, SUPPORT_TICKET_ERROR_MESSAGE } from "@/lib/support/errors";
import {
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_PRIORITY_LABEL,
  SUPPORT_TICKET_TYPE_LABEL,
  SUPPORT_TICKET_TYPES,
} from "@/lib/support/labels";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2";

export default async function NewConsoleTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ facilityId?: string; error?: string }>;
}) {
  const session = await requireHarborStaff();
  const { facilityId, error } = await searchParams;
  const [facilities, staff] = await Promise.all([
    prisma.facility.findMany({
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, billingEmail: true },
      take: 200,
    }),
    prisma.platformStaff.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);
  const selected = facilities.find((row) => row.id === facilityId) ?? null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New ticket</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Record a customer request. Opening a ticket doesn&apos;t email anyone; the first note is internal.
        </p>
      </header>
      {isSupportTicketErrorCode(error) ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {SUPPORT_TICKET_ERROR_MESSAGE[error]}
        </p>
      ) : null}
      <form action={createSupportTicketAction} className="space-y-4 rounded-md border border-[var(--border)] bg-white p-4">
        <label className="block text-sm">
          <span className="font-medium">Requester email</span>
          <input
            name="requesterEmail"
            type="email"
            required
            maxLength={200}
            defaultValue={selected?.billingEmail ?? ""}
            className={INPUT_CLASS}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Requester name</span>
          <span className="ml-1 text-[var(--text-secondary)]">(optional)</span>
          <input name="requesterName" maxLength={120} className={INPUT_CLASS} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Facility</span>
          <span className="ml-1 text-[var(--text-secondary)]">(optional)</span>
          <select name="facilityId" defaultValue={selected?.id ?? ""} className={INPUT_CLASS}>
            <option value="">No facility</option>
            {facilities.map((facility) => (
              <option key={facility.id} value={facility.id}>
                {facility.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Subject</span>
          <input name="subject" required minLength={3} maxLength={160} className={INPUT_CLASS} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm">
            <span className="font-medium">Type</span>
            <select name="type" defaultValue="" className={INPUT_CLASS}>
              <option value="">Unclassified</option>
              {SUPPORT_TICKET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {SUPPORT_TICKET_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Priority</span>
            <select name="priority" defaultValue="NORMAL" className={INPUT_CLASS}>
              {SUPPORT_TICKET_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {SUPPORT_TICKET_PRIORITY_LABEL[priority]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Assignee</span>
            <select name="assignedStaffId" defaultValue="" className={INPUT_CLASS}>
              <option value="">Unassigned</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.id === session.uid ? `${member.displayName} (me)` : member.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-medium">Internal note</span>
          <textarea name="body" required maxLength={8000} rows={5} className={INPUT_CLASS} />
        </label>
        <SupportSubmitButton pendingLabel="Opening…">Open ticket</SupportSubmitButton>
      </form>
    </div>
  );
}

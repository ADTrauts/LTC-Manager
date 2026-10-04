import Link from "next/link";

import {
  createSupportAutomationRuleAction,
  setSupportAutomationRuleActiveAction,
  updateSupportAutomationRuleAction,
} from "@/app/console/(staff)/tickets/actions";
import { SupportSubmitButton } from "@/components/harbor-console/support-submit-button";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { isSupportTicketErrorCode, SUPPORT_TICKET_ERROR_MESSAGE } from "@/lib/support/errors";
import {
  listRecentSupportAutomationRuns,
  listSupportAutomationRules,
  SUPPORT_AUTOMATION_ACTION_LABEL,
  SUPPORT_AUTOMATION_MINUTES_PER_DAY,
  SUPPORT_AUTOMATION_TYPE_LABEL,
  SUPPORT_AUTOMATION_TYPES,
  supportAutomationDelayLabel,
} from "@/lib/support/automation";
import { listSupportSavedReplies } from "@/lib/support/saved-replies";
import { formatSupportTicketNumber } from "@/lib/support/ticket-number";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm";

function formatRunTime(value: Date) {
  return value.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function SupportAutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireHarborStaff();
  const [{ error }, rules, replies, runs] = await Promise.all([
    searchParams,
    listSupportAutomationRules(prisma),
    listSupportSavedReplies(prisma),
    listRecentSupportAutomationRuns(prisma),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm">
          <Link href="/console/tickets" className="text-[var(--text-secondary)] hover:underline">
            Tickets
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Automations</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Time-based support actions. They use elapsed UTC time, not facility service days. The
          current policy is a 5-day reminder, 10-day resolve, and 7-day close. The job runs once a
          day, so an eligible ticket is handled on the next daily pass. Unassigned timed alerts stay
          off until hourly scheduling is available. A Saved Reply is reusable text; a Macro is a
          staff action; a notification tells staff; automation is the system acting.
        </p>
      </header>

      {isSupportTicketErrorCode(error) ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {SUPPORT_TICKET_ERROR_MESSAGE[error]}
        </p>
      ) : null}

      <form action={createSupportAutomationRuleAction} className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold">Create rule</h2>
        <label className="block text-sm">
          <span className="font-medium">Name</span>
          <input name="name" required maxLength={80} className={INPUT_CLASS} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Type</span>
          <select name="type" required className={INPUT_CLASS} defaultValue="WAITING_REMINDER">
            {SUPPORT_AUTOMATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {SUPPORT_AUTOMATION_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">After (days)</span>
          <input name="delayDays" type="number" min={0} defaultValue={5} className={INPUT_CLASS} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">After (hours, unassigned alert)</span>
          <input name="delayHours" type="number" min={0} defaultValue={2} className={INPUT_CLASS} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Saved Reply</span>
          <select name="savedReplyId" className={INPUT_CLASS} defaultValue="">
            <option value="">None — required for reminders</option>
            {replies
              .filter((reply) => reply.isActive)
              .map((reply) => (
                <option key={reply.id} value={reply.id}>
                  {reply.name}
                </option>
              ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" />
          Turn on this rule
        </label>
        <SupportSubmitButton pendingLabel="Creating…">Create rule</SupportSubmitButton>
      </form>

      <div className="space-y-4">
        {rules.length === 0 ? (
          <p className="rounded-md border border-[var(--border)] bg-white px-4 py-6 text-sm text-[var(--text-secondary)]">
            No automation rules. Nothing runs until Harbor creates and turns one on.
          </p>
        ) : (
          rules.map((rule) => (
            <article key={rule.id} className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{rule.name}</h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {SUPPORT_AUTOMATION_TYPE_LABEL[rule.type]} · After{" "}
                    {supportAutomationDelayLabel(rule.type, rule.delayMinutes)} ·{" "}
                    {rule.isActive ? "On" : "Off"}
                    {rule.savedReply ? ` · ${rule.savedReply.name}` : ""}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Applied {rule._count.runs} times
                  </p>
                </div>
                <form action={setSupportAutomationRuleActiveAction}>
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <input type="hidden" name="isActive" value={rule.isActive ? "false" : "true"} />
                  <SupportSubmitButton pendingLabel="Saving…" variant="secondary">
                    {rule.isActive ? "Turn off" : "Turn on"}
                  </SupportSubmitButton>
                </form>
              </div>
              <form action={updateSupportAutomationRuleAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="ruleId" value={rule.id} />
                <label className="block text-sm sm:col-span-2">
                  <span className="font-medium">Name</span>
                  <input name="name" required maxLength={80} defaultValue={rule.name} className={INPUT_CLASS} />
                </label>
                {rule.type === "UNASSIGNED_ALERT" ? (
                  <label className="block text-sm">
                    <span className="font-medium">After (hours)</span>
                    <input
                      name="delayHours"
                      type="number"
                      min={0}
                      defaultValue={Math.max(0, Math.round(rule.delayMinutes / 60))}
                      className={INPUT_CLASS}
                    />
                  </label>
                ) : (
                  <label className="block text-sm">
                    <span className="font-medium">After (days)</span>
                    <input
                      name="delayDays"
                      type="number"
                      min={0}
                      defaultValue={Math.max(0, Math.round(rule.delayMinutes / SUPPORT_AUTOMATION_MINUTES_PER_DAY))}
                      className={INPUT_CLASS}
                    />
                  </label>
                )}
                {rule.type === "WAITING_REMINDER" || rule.type === "WAITING_RESOLVE" ? (
                  <label className="block text-sm">
                    <span className="font-medium">Saved Reply</span>
                    <select name="savedReplyId" className={INPUT_CLASS} defaultValue={rule.savedReplyId ?? ""}>
                      <option value="">{rule.type === "WAITING_REMINDER" ? "Required" : "None — resolve without email"}</option>
                      {replies
                        .filter((reply) => reply.isActive || reply.id === rule.savedReplyId)
                        .map((reply) => (
                          <option key={reply.id} value={reply.id}>
                            {reply.name}
                            {reply.isActive ? "" : " (inactive)"}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
                <div className="sm:col-span-2">
                  <SupportSubmitButton pendingLabel="Saving…" variant="secondary">
                    Save
                  </SupportSubmitButton>
                </div>
              </form>
            </article>
          ))
        )}
      </div>

      <section className="rounded-md border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold">Recent activity</h2>
        {runs.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">No automation activity yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {runs.map((run) => (
              <li key={run.id} className="py-2 text-sm">
                <Link href={`/console/tickets/${run.ticket.id}`} className="font-medium hover:underline">
                  {formatSupportTicketNumber(run.ticket.number)}
                </Link>
                <p className="text-[var(--text-secondary)]">
                  {SUPPORT_AUTOMATION_ACTION_LABEL[run.action]}
                  {run.outcome !== "APPLIED" ? ` · ${run.outcome.toLowerCase()}` : ""}
                  {" · "}
                  {formatRunTime(run.occurredAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

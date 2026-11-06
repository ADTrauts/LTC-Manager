import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import { FocusedAttention } from "@/components/notifications/focused-attention";
import type { NotificationCenterItem, NotificationCenterModel } from "@/lib/notifications/queries";
import { SNOOZE_DURATION_CHOICES } from "@/lib/notifications/snooze";

type AttentionActions = {
  markRead: (formData: FormData) => Promise<void>;
  acknowledge: (formData: FormData) => Promise<void>;
  snooze: (formData: FormData) => Promise<void>;
  resume: (formData: FormData) => Promise<void>;
};

type NotificationCenterProps = {
  model: Extract<NotificationCenterModel, { status: "ready" }>;
  notice: string | null;
  focusId?: string | null;
  actions: AttentionActions;
};

export function NotificationCenter({ model, notice, focusId = null, actions }: NotificationCenterProps) {
  return (
    <section className="mx-auto min-w-0 max-w-3xl" data-testid="notification-center">
      <header className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Attention</h1>
        <p className="mt-1 text-sm text-zinc-600">
          What still needs you in this facility. Reading an item does not close the condition.
        </p>
      </header>
      <FocusedAttention id={focusId} />
      {notice ? (
        <p className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700" role="status">
          {notice}
        </p>
      ) : null}
      <div className="mt-6 space-y-8">
        <AttentionSection
          id="needs-attention"
          title="Needs Attention"
          empty="Nothing needs your attention right now."
          items={model.needsAttention}
          actions={actions}
          browserDeliveryActive={model.browserDeliveryActive}
          focusId={focusId}
        />
        {model.messages.length > 0 ? (
          <AttentionSection
            id="messages"
            title="Messages"
            empty=""
            items={model.messages}
            actions={actions}
            browserDeliveryActive={model.browserDeliveryActive}
            focusId={focusId}
          />
        ) : null}
        <AttentionSection
          id="updates"
          title="Updates"
          empty="No updates."
          items={model.updates}
          actions={actions}
          browserDeliveryActive={model.browserDeliveryActive}
          focusId={focusId}
        />
        {model.ended.length > 0 ? (
          <AttentionSection
            id="ended"
            title="Ended"
            empty=""
            items={model.ended}
            actions={actions}
            browserDeliveryActive={model.browserDeliveryActive}
            focusId={focusId}
          />
        ) : null}
        <AttentionSection
          id="resolved"
          title="Resolved"
          empty="No recently resolved items."
          items={model.resolved}
          actions={actions}
          browserDeliveryActive={model.browserDeliveryActive}
          focusId={focusId}
        />
      </div>
    </section>
  );
}

function AttentionSection({
  id,
  title,
  empty,
  items,
  actions,
  browserDeliveryActive,
  focusId,
}: {
  id: string;
  title: string;
  empty: string;
  items: NotificationCenterItem[];
  actions: AttentionActions;
  browserDeliveryActive: boolean;
  focusId: string | null;
}) {
  return (
    <section aria-labelledby={`attention-${id}`} data-testid={`attention-section-${id}`}>
      <h2 id={`attention-${id}`} className="text-base font-semibold text-zinc-900">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <AttentionItem
                item={item}
                actions={actions}
                browserDeliveryActive={browserDeliveryActive}
                focused={item.id === focusId}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AttentionItem({
  item,
  actions,
  browserDeliveryActive,
  focused,
}: {
  item: NotificationCenterItem;
  actions: AttentionActions;
  browserDeliveryActive: boolean;
  focused: boolean;
}) {
  const open = item.section !== "resolved" && item.section !== "ended";
  return (
    <article
      id={`attention-item-${item.id}`}
      data-testid="attention-item"
      data-attention-id={item.id}
      data-focused={focused ? "true" : "false"}
      data-priority={item.priority}
      data-section={item.section}
      tabIndex={focused ? -1 : undefined}
      className={`min-w-0 rounded-lg border bg-white p-3 sm:p-4 ${
        focused ? "border-zinc-900" : "border-zinc-200"
      } ${priorityEdge(item.priority)}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className={`text-xs font-semibold ${priorityText(item.priority)}`}>{item.priorityLabel}</p>
        {item.read ? <p className="text-xs text-zinc-500">Read</p> : null}
        {item.acknowledged ? <p className="text-xs font-medium text-zinc-700">Acknowledged</p> : null}
        {item.section === "resolved" ? <p className="text-xs font-medium text-zinc-700">Resolved</p> : null}
        {item.section === "ended" ? <p className="text-xs font-medium text-zinc-700">Ended</p> : null}
      </div>
      <h3 className="mt-1 text-sm font-medium text-zinc-900">{item.title}</h3>
      <p className="mt-1 text-sm text-zinc-800">{item.body}</p>
      <p className="mt-2 text-xs text-zinc-600">
        {item.departmentName ? `${item.departmentName} · ` : null}
        {item.occurredAtLabel}
        {item.resolvedAtLabel ? ` · Resolved ${item.resolvedAtLabel}` : null}
        {item.section === "ended" && item.endedAtLabel ? ` · Ended ${item.endedAtLabel}` : null}
      </p>
      {item.explanations.map((explanation) => (
        <p key={explanation} className="mt-2 text-sm text-zinc-600">
          {explanation}
        </p>
      ))}
      {item.acknowledged && open ? (
        <p className="mt-2 text-sm text-zinc-700">Acknowledged. The condition is still open.</p>
      ) : null}
      <div className="mt-3 flex min-w-0 flex-wrap gap-2">
        {item.actionPath && item.actionLabel ? (
          <a
            href={item.actionPath}
            data-testid="attention-action"
            className="inline-flex min-h-10 items-center rounded-md border border-zinc-900 px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            {item.actionLabel}
          </a>
        ) : null}
        {open && !item.read ? (
          <form action={actions.markRead}>
            <input type="hidden" name="notificationId" value={item.id} />
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-3 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              Mark read
            </button>
          </form>
        ) : null}
        {open && item.requiresAcknowledgement && !item.acknowledged ? (
          <form action={actions.acknowledge}>
            <input type="hidden" name="notificationId" value={item.id} />
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-3 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              Acknowledge
            </button>
          </form>
        ) : null}
        {open ? (
          <SnoozeControl item={item} actions={actions} browserDeliveryActive={browserDeliveryActive} />
        ) : null}
      </div>
    </article>
  );
}

function SnoozeControl({
  item,
  actions,
  browserDeliveryActive,
}: {
  item: NotificationCenterItem;
  actions: AttentionActions;
  browserDeliveryActive: boolean;
}) {
  if (item.snooze.state === "hidden") return null;
  if (item.snooze.state === "paused") {
    return (
      <div className="flex min-w-0 flex-col gap-2" data-testid="attention-snooze-paused">
        <p className="text-sm text-zinc-700">Browser alerts paused until {item.snooze.untilLabel}.</p>
        <p className="text-sm text-zinc-600">This notification remains in your Notification Center.</p>
        {browserDeliveryActive ? null : (
          <p className="text-sm text-zinc-600">Browser delivery is not active yet.</p>
        )}
        <form action={actions.resume}>
          <input type="hidden" name="notificationId" value={item.id} />
          <button
            type="submit"
            className={`inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-3 text-sm text-zinc-800 hover:bg-zinc-50 ${FOCUS_RING_CLASS}`}
          >
            Resume browser alerts
          </button>
        </form>
      </div>
    );
  }
  return (
    <details className="min-w-0" data-testid="attention-snooze">
      <summary
        className={`inline-flex min-h-10 cursor-pointer list-none items-center rounded-md border border-zinc-300 px-3 text-sm text-zinc-800 hover:bg-zinc-50 ${FOCUS_RING_CLASS}`}
      >
        Pause browser alerts
      </summary>
      <div className="mt-2 max-w-sm space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
        <p className="text-sm text-zinc-700">
          Browser alerts will pause temporarily. This notification will remain in your Notification Center.
        </p>
        {browserDeliveryActive ? null : (
          <p className="text-sm text-zinc-600">
            Browser delivery is not active yet. This pause is saved for when it is.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {SNOOZE_DURATION_CHOICES.map((choice) => (
            <form key={choice.token} action={actions.snooze}>
              <input type="hidden" name="notificationId" value={item.id} />
              <input type="hidden" name="duration" value={choice.token} />
              <button
                type="submit"
                className={`inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 hover:bg-zinc-50 ${FOCUS_RING_CLASS}`}
              >
                {choice.label}
              </button>
            </form>
          ))}
        </div>
      </div>
    </details>
  );
}

function priorityEdge(priority: NotificationCenterItem["priority"]): string {
  switch (priority) {
    case "CRITICAL":
      return "border-l-4 border-l-zinc-900";
    case "URGENT":
      return "border-l-4 border-l-zinc-700";
    case "NEEDS_ATTENTION":
      return "border-l-4 border-l-zinc-400";
    case "UPDATE":
      return "border-l-4 border-l-zinc-200";
  }
}

function priorityText(priority: NotificationCenterItem["priority"]): string {
  switch (priority) {
    case "CRITICAL":
      return "uppercase tracking-wide text-zinc-900";
    case "URGENT":
      return "text-zinc-800";
    case "NEEDS_ATTENTION":
      return "text-zinc-700";
    case "UPDATE":
      return "text-zinc-500";
  }
}

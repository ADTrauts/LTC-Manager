import { redirect } from "next/navigation";

import { AttentionFacilityEntry } from "@/components/notifications/attention-facility-entry";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { getSession } from "@/lib/auth";
import { resolveAttentionClick } from "@/lib/notifications/attention-click";
import { notificationActorFromSession } from "@/lib/notifications/center";
import { loadNotificationCenter } from "@/lib/notifications/queries";
import { prisma } from "@/lib/prisma";

import {
  acknowledgeNotificationAction,
  markNotificationReadAction,
  resumeBrowserAlertsAction,
  snoozeNotificationAction,
} from "./actions";

type NotificationsPageProps = {
  searchParams?: Promise<{ notice?: string | string[] | undefined; attention?: string | string[] | undefined }>;
};

export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
  const session = await getSession();
  const actor = notificationActorFromSession(session);
  if (!session) redirect("/login");
  if (!actor) {
    return (
      <section className="mx-auto max-w-3xl" data-testid="notification-center-pin">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Attention</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Personal attention belongs to a signed-in user. A PIN session does not open another person&apos;s attention.
        </p>
      </section>
    );
  }

  const query = searchParams ? await searchParams : {};
  const attentionId = typeof query.attention === "string" ? query.attention : "";
  const click = attentionId
    ? await resolveAttentionClick(prisma, {
        userId: actor.userId,
        facilityId: actor.facilityId,
        attentionId,
      })
    : { kind: "ignore" as const };
  if (click.kind === "switch") {
    return <AttentionFacilityEntry contextKey={click.contextKey} next={click.next} />;
  }

  const facility = await prisma.facility.findUnique({
    where: { id: actor.facilityId },
    select: { timezone: true },
  });
  const model = await loadNotificationCenter(prisma, {
    userId: actor.userId,
    facilityId: actor.facilityId,
    now: new Date(),
    timeZone: facility?.timezone || "UTC",
  });
  if (model.status === "no_access") {
    return (
      <section className="mx-auto max-w-3xl" data-testid="notification-center-denied">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Attention</h1>
        <p className="mt-2 text-sm text-zinc-600">You don&apos;t have access to attention for this facility.</p>
      </section>
    );
  }

  const notice =
    query.notice === "unavailable" || click.kind === "unavailable"
      ? "That item is not available."
      : click.kind === "denied"
        ? "You don't have access to attention for that facility."
        : null;
  return (
    <NotificationCenter
      model={model}
      notice={notice}
      focusId={click.kind === "focus" ? click.notificationId : null}
      actions={{
        markRead: markNotificationReadAction,
        acknowledge: acknowledgeNotificationAction,
        snooze: snoozeNotificationAction,
        resume: resumeBrowserAlertsAction,
      }}
    />
  );
}

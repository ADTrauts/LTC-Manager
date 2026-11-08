import { redirect } from "next/navigation";

import { BrowserAlertsPanel } from "@/components/notifications/browser-alerts-panel";
import { QuietHoursForm } from "@/components/notifications/quiet-hours-form";
import { getSession } from "@/lib/auth";
import { typeClasses } from "@/lib/design-system";
import { notificationActorFromSession } from "@/lib/notifications/center";
import { loadNotificationPreference } from "@/lib/notifications/notification-preference";
import { isWebPushSendingEnabled } from "@/lib/notifications/web-push-config";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserSession } from "@/lib/user-session";

import { saveQuietHoursAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ notice?: string | string[] | undefined }>;
}) {
  const session = await getAuthenticatedUserSession();
  if (!session) redirect("/login");
  const actor = notificationActorFromSession(await getSession());
  const deliveryActive = isWebPushSendingEnabled();
  const query = searchParams ? await searchParams : {};
  const notice =
    query.notice === "saved"
      ? "Quiet Hours saved for this facility."
      : query.notice === "unavailable"
        ? "Quiet Hours could not be saved."
        : null;

  let quiet: { facilityName: string; timeZone: string; preference: Awaited<ReturnType<typeof loadNotificationPreference>> } | null =
    null;
  if (actor) {
    const facility = await prisma.facility.findUnique({
      where: { id: actor.facilityId },
      select: { displayName: true, timezone: true },
    });
    if (facility) {
      quiet = {
        facilityName: facility.displayName,
        timeZone: facility.timezone,
        preference: await loadNotificationPreference(prisma, actor),
      };
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className={typeClasses.pageTitle}>Notifications</h1>
      <p className="mt-2 text-sm text-zinc-600">How this personal device tells you that attention is waiting.</p>
      {notice ? (
        <p className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700" role="status">
          {notice}
        </p>
      ) : null}
      <section className="mt-8 rounded-lg border border-zinc-200 bg-white p-4">
        <BrowserAlertsPanel deliveryActive={deliveryActive} />
      </section>
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
        {quiet ? (
          <QuietHoursForm
            facilityName={quiet.facilityName}
            timeZone={quiet.timeZone}
            deliveryActive={deliveryActive}
            preference={quiet.preference}
            action={saveQuietHoursAction}
          />
        ) : (
          <div data-testid="quiet-hours-facility">
            <h2 className="text-lg font-semibold text-zinc-900">Quiet Hours</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Quiet Hours belong to you at the facility you are working in. Open a facility to set them.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

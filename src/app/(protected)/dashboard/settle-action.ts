"use server";

import { getSession } from "@/lib/auth";
import { isDashboardV2Enabled } from "@/lib/feature-flags";
import { trackEvent } from "@/lib/telemetry";

/** One sample for the Dashboard settle budget. Logged with the existing event stream. */
export async function recordDashboardSettle(input: {
  elapsedMs: number;
  cardCount: number;
  scope: string | null;
}): Promise<void> {
  if (!isDashboardV2Enabled()) return;
  const session = await getSession();
  if (!session?.facilityId) return;
  if (!Number.isFinite(input.elapsedMs) || input.elapsedMs < 0 || input.elapsedMs > 10 * 60 * 1000) return;
  const cardCount = Number.isFinite(input.cardCount) ? Math.max(0, Math.round(input.cardCount)) : 0;
  const scope = typeof input.scope === "string" && input.scope.length > 0 && input.scope.length <= 80 ? input.scope : null;
  await trackEvent("dashboard.settled", {
    elapsedMs: Math.round(input.elapsedMs),
    cardCount,
    scope,
    facilityId: session.facilityId,
    role: session.role,
  });
}

import { redirect } from "next/navigation";
import { requireAtLeastRole } from "@/lib/access";
import { SetupWizard } from "@/components/setup-wizard";
import { getSession } from "@/lib/auth";
import { applyCheckoutSessionId } from "@/lib/billing/sync-from-stripe";
import { loadSetupWorkspace } from "@/lib/onboarding/workspace";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ checkout?: string; session_id?: string }> }) {
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");
  const params = await searchParams;
  let checkoutOutcome: string | null = null;
  if (params.session_id) {
    try {
      const result = await applyCheckoutSessionId({ checkoutSessionId: params.session_id, expectedFacilityId: session.facilityId });
      checkoutOutcome = result.code === "RECONCILED" ? result.result.code : result.code;
    } catch { checkoutOutcome = "RETRY_REQUIRED"; }
  }
  const workspace = await loadSetupWorkspace(prisma, session);
  if (workspace.structure.firstConfigurationAt) {
    const confirmed = workspace.facility.onboardingEntryConfirmedAt;
    await trackEvent("onboarding.configuration.observed", {
      facilityId: session.facilityId, firstStoredLocationAt: workspace.structure.firstConfigurationAt.toISOString(),
      millisecondsFromEntryConfirmation: confirmed && +workspace.structure.firstConfigurationAt >= +confirmed ? +workspace.structure.firstConfigurationAt - +confirmed : null,
      measurement: "earliest stored Facility location; observation may repeat; not operational readiness",
    });
  }
  return <main className="min-h-screen bg-zinc-50 px-4 py-8"><SetupWizard key={session.facilityId} initial={JSON.parse(JSON.stringify(workspace))} checkoutOutcome={checkoutOutcome} checkout={params.checkout ?? null} /></main>;
}

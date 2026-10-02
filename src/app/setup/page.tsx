import { redirect } from "next/navigation";

import { SetupWizard } from "@/components/setup-wizard";
import { getSession } from "@/lib/auth";
import { applyCheckoutSessionId } from "@/lib/billing/sync-from-stripe";
import { prisma } from "@/lib/prisma";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string }>;
}) {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const params = await searchParams;
  if (params.session_id) {
    try {
      const applied = await applyCheckoutSessionId({
        checkoutSessionId: params.session_id,
        expectedFacilityId: session.facilityId,
      });
      if (applied) {
        await prisma.facility.update({
          where: { id: session.facilityId },
          data: { onboardingCurrentStep: "locations", onboardingStartedAt: new Date() },
        });
      }
    } catch (error) {
      console.error("setup.checkout.sync.failed", {
        facilityId: session.facilityId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: {
      onboardingCompletedAt: true,
    },
  });

  if (!facility) {
    redirect("/login");
  }
  if (facility.onboardingCompletedAt) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <SetupWizard checkout={params.checkout ?? null} />
    </main>
  );
}

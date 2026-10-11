"use server";

import { revalidatePath } from "next/cache";

import { requireHarborStaff } from "@/lib/harbor-console/auth";
import {
  syncFacilityBillingFromStripe,
  type FacilityStripeSyncResult,
} from "@/lib/billing/sync-from-stripe";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

export type ConsoleSyncFromStripeState = FacilityStripeSyncResult | null;

/**
 * Console recovery action: Stripe → Vssyl only.
 * Never accepts billing state from the browser. Never mutates Stripe.
 * Any authenticated Console staff (MEMBER or OWNER) may run this.
 */
export async function syncCustomerBillingFromStripeAction(
  _previous: ConsoleSyncFromStripeState,
  formData: FormData,
): Promise<ConsoleSyncFromStripeState> {
  const session = await requireHarborStaff();
  const facilityId = String(formData.get("facilityId") ?? "").trim();
  if (!facilityId) {
    return {
      ok: false,
      code: "FACILITY_NOT_FOUND",
      message: "Stripe data could not be reconciled safely.",
      changed: false,
    };
  }

  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: { id: true },
  });
  if (!facility) {
    return {
      ok: false,
      code: "FACILITY_NOT_FOUND",
      message: "Stripe data could not be reconciled safely.",
      changed: false,
    };
  }

  const result = await syncFacilityBillingFromStripe(facility.id);

  await trackEvent("billing.console.sync", {
    facilityId: facility.id,
    staffId: session.uid,
    staffRole: session.staffRole,
    code: result.code,
    changed: result.changed,
  });

  revalidatePath(`/console/customers/${facility.id}`);
  revalidatePath("/console/customers");
  return result;
}

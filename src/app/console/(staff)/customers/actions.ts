"use server";

import { revalidatePath } from "next/cache";

import { requireHarborOwner, requireHarborStaff } from "@/lib/harbor-console/auth";
import { AuthRateLimitBucketType, checkAuthRateLimit, passwordAccountBucketKey, registerAuthFailure } from "@/lib/auth-rate-limit";
import { changeFacilityOperationsSuspension, facilitySuspensionInputSchema, type FacilitySuspensionResult } from "@/lib/harbor-console/facility-suspension";
import {
  syncFacilityBillingFromStripe,
  type FacilityStripeSyncResult,
} from "@/lib/billing/sync-from-stripe";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

export type ConsoleSyncFromStripeState = FacilityStripeSyncResult | null;

export async function changeFacilitySuspensionAction(
  _previous: FacilitySuspensionResult | null, formData: FormData,
): Promise<FacilitySuspensionResult> {
  const session = await requireHarborOwner();
  const parsed = facilitySuspensionInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Enter a reason, the exact Facility name and your current password." };
  const buckets = [{ key: passwordAccountBucketKey(`harbor:${session.email}`), type: AuthRateLimitBucketType.PASSWORD_ACCOUNT }];
  const limit = await checkAuthRateLimit(buckets);
  if (limit.locked) return { ok: false, error: "Too many password attempts. Try again later." };
  const result = await changeFacilityOperationsSuspension(prisma, session, parsed.data);
  if (!result.ok && result.passwordRejected) await registerAuthFailure(buckets);
  if (result.ok) {
    revalidatePath(`/console/customers/${parsed.data.facilityId}`);
    revalidatePath(`/console/customers/${parsed.data.facilityId}/lifecycle`);
    revalidatePath("/console/customers");
    revalidatePath("/console/activity");
    revalidatePath("/", "layout");
  }
  return result;
}

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
  revalidatePath(`/console/customers/${facility.id}/lifecycle`);
  revalidatePath("/console/operations");
  revalidatePath("/console");
  return result;
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import {
  addDepartmentsToFacilitySubscription,
  BillingAddDepartmentsError,
} from "@/lib/billing/add-departments";
import { adminDepartmentManageHref } from "@/lib/department-administration";
import {
  DepartmentProductInstallError,
  resolvePublishedDepartmentProductKeys,
} from "@/lib/department-products";
import {
  areStripePricesConfiguredForQuote,
  MissingStripePriceError,
  stripeCheckoutLineItemsForQuote,
} from "@/lib/billing/checkout-items";
import { quoteBilling } from "@/lib/billing/quote";
import { resolveRequestOrigin } from "@/lib/billing/request-origin";
import { ensureFacilityStripeCustomer } from "@/lib/billing/stripe-customer";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient } from "@/lib/stripe";
import { trackEvent } from "@/lib/telemetry";

export type BillingActionState = {
  error: string | null;
};

const checkoutSchema = z.object({
  departmentKeys: z.array(z.string().trim().min(1).max(40)).min(1),
  interval: z.enum(["MONTHLY", "ANNUAL"]),
  setupPath: z.enum(["SELF_SERVE", "ASSISTED"]),
});

export async function startBillingCheckoutAction(
  _previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");

  const parsed = checkoutSchema.safeParse({
    departmentKeys: formData.getAll("departmentKey").map(String),
    interval: formData.get("interval"),
    setupPath: formData.get("setupPath"),
  });
  if (!parsed.success) {
    return { error: "Select at least one department and a billing interval." };
  }

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: {
      id: true,
      displayName: true,
      billingEmail: true,
      stripeCustomerId: true,
      billing: { select: { status: true, stripeSubscriptionId: true } },
    },
  });
  if (!facility) {
    return { error: "Facility not found." };
  }

  if (
    facility.billing?.stripeSubscriptionId &&
    (facility.billing.status === "ACTIVE" || facility.billing.status === "PAST_DUE")
  ) {
    return { error: "This facility already has a subscription. Use Manage billing to update payment." };
  }

  let publishedKeys: string[];
  try {
    publishedKeys = resolvePublishedDepartmentProductKeys(parsed.data.departmentKeys);
  } catch (error) {
    if (error instanceof DepartmentProductInstallError) {
      return { error: error.message };
    }
    throw error;
  }

  const returnTo = checkoutReturnTo(formData.get("returnTo"));

  const quote = quoteBilling({
    departmentCount: publishedKeys.length,
    interval: parsed.data.interval,
    setupPath: parsed.data.setupPath,
  });
  if (!areStripePricesConfiguredForQuote(quote)) {
    return { error: "Stripe prices are not configured for this plan yet." };
  }

  try {
    const customerId = await ensureFacilityStripeCustomer({
      facilityId: facility.id,
      displayName: facility.displayName,
      billingEmail: facility.billingEmail,
      stripeCustomerId: facility.stripeCustomerId,
      fallbackEmail: session.email,
    });
    const origin = await resolveRequestOrigin();
    const stripe = getStripeServerClient();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: facility.id,
      line_items: stripeCheckoutLineItemsForQuote(quote),
      success_url: `${origin}${checkoutSuccessPath(returnTo)}`,
      cancel_url: `${origin}${checkoutCancelPath(returnTo)}`,
      customer_update: { address: "auto", name: "auto" },
      metadata: {
        facilityId: facility.id,
        departmentKeys: publishedKeys.join(","),
        interval: parsed.data.interval,
        setupPath: parsed.data.setupPath,
      },
      subscription_data: {
        metadata: {
          facilityId: facility.id,
          departmentKeys: publishedKeys.join(","),
          interval: parsed.data.interval,
          setupPath: parsed.data.setupPath,
        },
      },
      integration_identifier: `ltc-admin-checkout-${randomLetterSuffix()}`,
    });

    if (!checkoutSession.url) {
      return { error: "Stripe did not return a checkout URL." };
    }

    await trackEvent("billing.checkout.created", {
      facilityId: facility.id,
      checkoutSessionId: checkoutSession.id,
      departmentCount: publishedKeys.length,
    });

    redirect(checkoutSession.url);
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    return { error: publicCheckoutError(error) };
  }
}

export async function addBillingDepartmentsAction(
  _previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");

  let departmentKeys: string[];
  try {
    departmentKeys = resolvePublishedDepartmentProductKeys(formData.getAll("departmentKey").map(String));
  } catch (error) {
    if (error instanceof DepartmentProductInstallError) {
      return { error: error.message };
    }
    throw error;
  }

  try {
    await addDepartmentsToFacilitySubscription({
      facilityId: session.facilityId,
      departmentKeysToAdd: departmentKeys,
    });
    const returnTo = formData.get("returnTo");
    if (returnTo === "departments") {
      redirect("/admin/departments");
    }
    if (returnTo === "department-builder" && departmentKeys.length === 1) {
      const installed = await prisma.department.findUnique({
        where: {
          facilityId_key: { facilityId: session.facilityId, key: departmentKeys[0]! },
        },
        select: { id: true },
      });
      if (installed) {
        redirect(adminDepartmentManageHref(installed.id));
      }
    }
    redirect("/admin/billing?departments=added");
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    if (error instanceof BillingAddDepartmentsError) {
      return { error: error.message };
    }
    return { error: "Unable to add departments. Try again." };
  }
}

export async function startBillingPortalAction(
  _previous: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: {
      id: true,
      stripeCustomerId: true,
    },
  });
  if (!facility?.stripeCustomerId) {
    return { error: "No Stripe customer is on file yet. Start checkout first." };
  }

  try {
    const origin = await resolveRequestOrigin();
    const stripe = getStripeServerClient();
    const configurationId = await ensureBillingPortalConfiguration();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: facility.stripeCustomerId,
      return_url: `${origin}/admin/billing`,
      ...(configurationId ? { configuration: configurationId } : {}),
    });
    if (!portalSession.url) {
      return { error: "Stripe did not return a billing portal URL." };
    }
    await trackEvent("billing.portal.created", {
      facilityId: facility.id,
      portalSessionId: portalSession.id,
    });
    redirect(portalSession.url);
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    return { error: "Unable to open the billing portal. Enable Customer Portal in Stripe and try again." };
  }
}

async function ensureBillingPortalConfiguration(): Promise<string | null> {
  const stripe = getStripeServerClient();
  const existing = await stripe.billingPortal.configurations.list({ limit: 1 });
  if (existing.data[0]?.id) {
    return existing.data[0].id;
  }

  const created = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Vssyl billing" },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
    },
  });
  return created.id;
}

function publicCheckoutError(error: unknown): string {
  if (error instanceof MissingStripePriceError) {
    return "Stripe prices are not configured for this plan yet.";
  }
  if (error instanceof Error && error.message.includes("STRIPE_SECRET_KEY")) {
    return "Stripe is not configured.";
  }
  return "Unable to start checkout. Try again.";
}

function isNextRedirect(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_REDIRECT"),
  );
}

type CheckoutReturnTo = "billing" | "setup" | "departments";

function checkoutReturnTo(value: FormDataEntryValue | null): CheckoutReturnTo {
  if (value === "setup" || value === "departments") return value;
  return "billing";
}

function checkoutSuccessPath(returnTo: CheckoutReturnTo): string {
  if (returnTo === "setup") {
    return "/setup?checkout=success&session_id={CHECKOUT_SESSION_ID}";
  }
  if (returnTo === "departments") {
    return "/admin/departments?checkout=success&session_id={CHECKOUT_SESSION_ID}";
  }
  return "/admin/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}";
}

function checkoutCancelPath(returnTo: CheckoutReturnTo): string {
  if (returnTo === "setup") return "/setup?checkout=canceled";
  if (returnTo === "departments") return "/admin/departments?checkout=canceled";
  return "/admin/billing?checkout=canceled";
}

function randomLetterSuffix(length = 8): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)] ?? "a";
  }
  return value;
}

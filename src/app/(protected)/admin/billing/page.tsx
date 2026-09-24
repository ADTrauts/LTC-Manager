import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { BillingPlanForm } from "@/app/(protected)/admin/billing/billing-plan-form";
import { areAllCatalogPricesConfigured } from "@/lib/billing/stripe-prices";
import { formatUsdCents } from "@/lib/billing/format";
import { quoteBilling } from "@/lib/billing/quote";
import { applyCheckoutSessionId, syncFacilityBillingFromStripe } from "@/lib/billing/sync-from-stripe";
import type { FacilityBillingStatus } from "@/lib/billing/entitlement";
import { assertFacilityAdministratorPage } from "@/lib/facility-admin-guard";
import { isBillingEntitlementsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient, isStripeSecretConfigured } from "@/lib/stripe";

const STATUS_COPY: Record<FacilityBillingStatus, { label: string; detail: string }> = {
  UNMANAGED: {
    label: "Not billed yet",
    detail: "Choose departments and start checkout when you are ready to pay.",
  },
  INCOMPLETE: {
    label: "Checkout incomplete",
    detail: "A checkout was started but not finished. You can try again below.",
  },
  ACTIVE: {
    label: "Active",
    detail: "This facility has a paid plan. Payment methods and invoices are managed in Stripe.",
  },
  PAST_DUE: {
    label: "Past due",
    detail: "The latest invoice did not collect. Update the card in Manage billing.",
  },
  CANCELED: {
    label: "Canceled",
    detail: "The previous plan was canceled. Start checkout again to resubscribe.",
  },
};

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string; departments?: string }>;
}) {
  const session = await assertFacilityAdministratorPage();
  const params = await searchParams;

  try {
    if (params.session_id) {
      await applyCheckoutSessionId({
        checkoutSessionId: params.session_id,
        expectedFacilityId: session.facilityId,
      });
    }
    await syncFacilityBillingFromStripe(session.facilityId);
  } catch (error) {
    console.error("billing.sync.failed", {
      facilityId: session.facilityId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: {
      billingEmail: true,
      stripeCustomerId: true,
      stripeDefaultPaymentMethodId: true,
      billing: {
        select: {
          status: true,
          interval: true,
          setupPath: true,
          licensedDepartmentCount: true,
          stripeSubscriptionId: true,
          entitlements: {
            where: { status: "ACTIVE" },
            select: { departmentKey: true },
          },
        },
      },
      departments: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { key: true, name: true },
      },
    },
  });

  const billingStatus: FacilityBillingStatus = facility?.billing?.status ?? "UNMANAGED";
  const licensedKeys = facility?.billing?.entitlements.map((row) => row.departmentKey) ?? [];
  const currentQuote =
    licensedKeys.length > 0
      ? quoteBilling({
          departmentCount: licensedKeys.length,
          interval: facility?.billing?.interval ?? "ANNUAL",
          setupPath: facility?.billing?.setupPath ?? "SELF_SERVE",
        })
      : null;
  const checkoutReady = isStripeSecretConfigured() && areAllCatalogPricesConfigured();

  const cardOnFile = await loadCardOnFile(facility?.stripeDefaultPaymentMethodId ?? null);

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-billing-page">
      <AdminPageHeader
        title="Billing"
        trail={[{ label: "Billing" }]}
        subtitle="Facility plan, departments included, and payment for this site. Facility Administrators only."
      />

      {params.checkout === "success" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          {billingStatus === "ACTIVE"
            ? "Payment received. This facility is on a paid plan."
            : "Checkout finished. If this page still says unpaid, refresh once — Stripe confirmation can lag by a few seconds."}
        </p>
      ) : null}
      {params.checkout === "canceled" ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          Checkout was canceled. No charge was made.
        </p>
      ) : null}
      {params.departments === "added" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          Departments added. The subscription was updated and any prorated charge is on this period’s invoice.
        </p>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Current status</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Plan</dt>
            <dd className="font-medium text-zinc-900">{STATUS_COPY[billingStatus].label}</dd>
            <p className="mt-1 text-zinc-600">{STATUS_COPY[billingStatus].detail}</p>
          </div>
          <div>
            <dt className="text-zinc-500">Billing email</dt>
            <dd className="font-medium text-zinc-900">{facility?.billingEmail ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Card on file</dt>
            <dd className="font-medium text-zinc-900">
              {cardOnFile ? `${cardOnFile.brand} •••• ${cardOnFile.last4}` : "None"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Included departments</dt>
            <dd className="font-medium text-zinc-900">
              {licensedKeys.length > 0
                ? (facility?.departments ?? [])
                    .filter((department) => licensedKeys.includes(department.key))
                    .map((department) => department.name)
                    .join(", ") || licensedKeys.join(", ")
                : "None selected yet"}
            </dd>
          </div>
        </dl>
        {currentQuote ? (
          <p className="mt-4 text-sm text-zinc-700">
            Current list:{" "}
            <span className="font-medium tabular-nums">
              {formatUsdCents(currentQuote.billedRecurringCents)}
            </span>{" "}
            {currentQuote.interval === "ANNUAL" ? "per year" : "per month"}
            {currentQuote.setupPath === "ASSISTED" ? ", plus assisted setup" : ""}.
          </p>
        ) : null}
      </section>

      <BillingPlanForm
        departments={facility?.departments ?? []}
        initialDepartmentKeys={licensedKeys}
        initialInterval={facility?.billing?.interval ?? "ANNUAL"}
        initialSetupPath={facility?.billing?.setupPath ?? "SELF_SERVE"}
        billingStatus={billingStatus}
        hasStripeCustomer={Boolean(facility?.stripeCustomerId)}
        checkoutReady={checkoutReady}
        isTestMode={Boolean(process.env.STRIPE_SECRET_KEY?.includes("_test_"))}
        entitlementsEnforced={isBillingEntitlementsEnabled()}
      />
    </div>
  );
}

async function loadCardOnFile(
  paymentMethodId: string | null,
): Promise<{ brand: string; last4: string } | null> {
  if (!paymentMethodId || !isStripeSecretConfigured()) return null;
  try {
    const paymentMethod = await getStripeServerClient().paymentMethods.retrieve(paymentMethodId);
    if (!paymentMethod.card) return null;
    return {
      brand: paymentMethod.card.brand,
      last4: paymentMethod.card.last4,
    };
  } catch {
    return null;
  }
}

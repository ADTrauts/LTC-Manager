/**
 * Environment-aware Stripe Dashboard deep links for Console diagnostics.
 * Never include secret keys in these URLs.
 */
export function isStripeTestMode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  return key.startsWith("sk_test_");
}

export function stripeDashboardBaseUrl(): string {
  return isStripeTestMode()
    ? "https://dashboard.stripe.com/test"
    : "https://dashboard.stripe.com";
}

export function stripeCustomerDashboardUrl(customerId: string): string {
  return `${stripeDashboardBaseUrl()}/customers/${encodeURIComponent(customerId)}`;
}

export function stripeSubscriptionDashboardUrl(subscriptionId: string): string {
  return `${stripeDashboardBaseUrl()}/subscriptions/${encodeURIComponent(subscriptionId)}`;
}

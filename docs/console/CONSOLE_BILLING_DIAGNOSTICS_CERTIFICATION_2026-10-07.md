# Console Billing Diagnostics — Certification

**Date:** 2026-10-07  
**Scope:** Customer detail diagnostics + Sync from Stripe recovery  
**Classification:** SUPPORTING  
**Canonical commercial policy:** [11 — Commercial Model](../product/11_COMMERCIAL_MODEL.md)  
**Broader plan (not implemented here):** [CONSOLE_BILLING_OPERATIONS_PHASE_PLAN_2026-10-07.md](./CONSOLE_BILLING_OPERATIONS_PHASE_PLAN_2026-10-07.md)

## Verdict

`PASS`

**Sealed:** 2026-10-11. Shared `/admin/billing` payment-method persistence was restored on `syncFacilityBillingFromStripe` after the 1A extraction dropped it.

## Final rule

```text
Stripe owns monetary subscription state.
FacilityBilling and FacilityDepartmentEntitlement are Vssyl's local mirror / access state.
Stripe webhooks are the normal synchronization path.
Console "Sync from Stripe" is a manual recovery path using the same canonical reconciliation logic.
Console does not directly manipulate subscription money or manually set billing status.
```

## What shipped

| Surface | Behavior |
|---|---|
| `/console/customers` | Facility name links to detail (unchanged route). Copy clarifies Stripe owns money. |
| `/console/customers/[facilityId]` | Account, Licensing, Billing diagnostics. Open in Stripe. Sync from Stripe. |
| Sync action | Server-only. `requireHarborStaff`. Stripe → Vssyl only. |
| Canonical reconcile | `planStripeSubscriptionReconciliation` / `applyResolvedStripeSubscription` shared by webhook subscription events and Console sync. |
| Payment method persist | `syncFacilityBillingFromStripe` still copies Stripe's current default payment method onto `Facility.stripeDefaultPaymentMethodId`. `/admin/billing` keeps calling this shared sync on load. Checkout completion keeps the same persist helper. No Stripe card mutation. |

## Authorization

| Action | Authority |
|---|---|
| View Customers / customer detail | Any authenticated Console staff (`MEMBER` or `OWNER`) |
| Sync from Stripe | Same — elevated relative to anonymous; server fails closed without Console session |

No client-only hiding. Sync never accepts billing status from the browser.

## Schema

None. Last local billing update uses existing `FacilityBilling.updatedAt`. No Prisma migration. Payment-method persist writes existing `Facility.stripeDefaultPaymentMethodId`.

## Explicitly not implemented

- Subscription editing, coupons, credits, pause/resume, cancel
- Complimentary / pilot grants, local billing overrides, “Set Active”
- Multi-site / org billing, invoice or card management
- Customer Portal replacement
- `BILLING_ENTITLEMENTS_ENABLED` rollout or enforcement changes
- Phases 1B–4 of the broader billing-operations plan

## Tests (2026-10-11)

| Suite | Result |
|---|---|
| `src/lib/billing/reconcile-from-stripe.hermetic.test.ts` | pass |
| `src/lib/billing/persist-default-payment-method.hermetic.test.ts` | pass |
| `src/lib/harbor-console/customer-billing-detail.hermetic.test.ts` | pass |
| `src/lib/harbor-console/presentation.hermetic.test.ts` | pass |
| `src/lib/billing/status.hermetic.test.ts` | pass |
| `src/lib/harbor-console/work-paths.hermetic.test.ts` | pass (`/admin/billing` denied in Harbor work sessions) |

`customer-selection.hermetic.test.ts` install-mock failures (`db.department.findFirst is not a function`) remain a pre-existing baseline in an unmodified committed file. Not part of 1A.

## Committed files

Billing diagnostics, shared Stripe → local sync, Harbor customer presentation, and the restored payment-method persist helper. The operations phase plan and unrelated dirty work are excluded.

## Remaining gaps

- Empty `departmentKeys` on an ACTIVE Stripe subscription still cannot be repaired from Console; staff must fix metadata in Stripe Dashboard, then sync.
- Invoice webhooks still update status via `applyFacilitySubscription` without re-reading department metadata (pre-existing; not part of this diagnostics slice).
- Sync has no confirmation step. Stripe is authoritative; Sync may change local entitlements.
- Canceled subscriptions update `FacilityBilling` to `CANCELED` but leave ACTIVE entitlements in place (existing `applyFacilitySubscription` contract).

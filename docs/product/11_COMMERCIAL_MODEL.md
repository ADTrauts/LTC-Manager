# 11 — Commercial Model

**Status:** Binding product policy (ADL-013)  
**List prices:** Working figures; first paying facilities may validate them  
**Does not:** Invent per-department Stripe prices, enable commercial enforcement until `BILLING_ENTITLEMENTS_ENABLED`, or sell DEVELOPMENT products. Checkout accepts AVAILABLE Department Product keys; installation happens after entitlement.

---

## What we sell

One product. Unlimited users at every role. Price follows **licensed operational departments** at a facility.

For Healthcare Food & Nutrition, EVS, and Facility Plant Operations, `FacilityDepartmentEntitlement.departmentKey` is the persisted installation key for that Product lineage. Healthcare Food & Nutrition keeps `DIETARY`. Facility Plant Operations keeps `PLANT`. The canonical Product key for Dietary is `HEALTHCARE_FOOD_NUTRITION`; `DIETARY` is a compatibility alias, not a second SKU. Facility Plant Operations is AVAILABLE; it has no dedicated Product-specific billing SKU in this release. Current checkout accepts AVAILABLE Products, including Plant, through the generic department-count prices described below. The absence of a dedicated Plant SKU is not a prohibition on that existing path. This October 17, 2026 wording reconciliation changes no release state, price, or sellability; deployed Stripe configuration has not been verified by ONB-00.

Canonical commercial order:

```text
Select AVAILABLE Department Product
        ↓
Stripe Checkout / subscription update
        ↓
FacilityDepartmentEntitlement ACTIVE
        ↓
installDepartmentProduct
        ↓
Department row
```

Checkout validates AVAILABLE registry keys. DEVELOPMENT products cannot be purchased. It does not require Department rows to exist first. Installation does not create entitlements. Price remains count-based (`ltc_*` lookup keys). Department-level Stripe price identity is not bound in this phase. Do not charge separately for Industry.

Do **not** charge per administrator, supervisor, employee, PIN user, room, or routine log.

`showInEmployeeApp`, `Department.isActive`, and `DIETARY_*` / `EVS_*` / `PLANT_*` flags are **not** licenses.

---

## List prices (USD)

| Deployment | Monthly list | Annual (10% off) |
|---|---:|---:|
| First department (facility foundation) | $299 | $3,229.20 |
| Each additional department | +$149 | +$1,609.20 |
| Whole-facility ceiling | $999 | $10,789.20 |

Examples: Dietary only $299/mo; Dietary + EVS $448/mo; three departments $597/mo; six or more $999/mo.

**Monthly is the list price.** Annual prepaid is **10% off** 12 × monthly ($299 × 12 × 0.9 = $3,229.20).

---

## Implementation service policy (ONB-05, approved October 18, 2026)

| Path | Implementation fee (USD) |
|---|---|
| Self-service onboarding | $0; normal subscription charges apply |
| Each separately approved assisted engagement | $1,500 for its first Department plus $500 for each additional Department within that engagement |

The same engagement pricing applies to initial onboarding and later engagements for existing subscribers. A later Department purchase never automatically incurs an implementation fee. A persistent `ASSISTED` preference is not an order or payment authorization. Do not invent another paid tier.

A Console **Owner** may authorize an implementation service-fee waiver. Record the actual PlatformStaff owner, reason and affected scope/order. The bounded order flow waives the entire quoted order; a waiver is not an unrecorded price edit. Every paid or waived scope still requires customer approval of its quote/scope revision. No automatic pilot exception is inferred.

Charges are **one-time, scope-bound and replay-safe**, on a durable service order separately approved by the customer. Use one-time Stripe Checkout `mode: payment` for the service; never create another subscription to collect it or append an unapproved implementation charge to a Department purchase. Subscription checkout remains recurring charges only. Unknown payment outcomes must be reconciled before retry. A new engagement requires its own approved scope and order; it is not implicit renewal of an old `ASSISTED` label.

Fees, waivers, service delivery, files and customer acceptance grant no subscription access, operational readiness or publication. D09's subscription transitions below remain binding. Customer files authorize intake/mapping only; canonical import preview/confirmation and publication remain separate authorized actions.

---

## Multi-site (later)

One agreement and invoice at the **organization**. Each facility is a licensed site using the same department math. Portfolio discount applies only to **contractually committed** sites (none below 5; 10% at 5; 15% at 10; 20% at 25; negotiated around 25% at 50+).

Stripe customer remains on `Facility` until org billing is scoped.

---

## Stripe catalog

Separate Products (not Prices on one Product):

1. **Vssyl — Facility** (includes first department) — monthly + annual Prices  
2. **Vssyl — Additional department** — monthly + annual Prices  
3. **Vssyl — Whole facility** — monthly + annual Prices (used when list would exceed $999)  
4. **Vssyl — Assisted setup (first department)** — one-time  
5. **Vssyl — Assisted setup (additional department)** — one-time  

Stripe **lookup keys** remain `ltc_*` until a billing migration is explicitly scoped.  

Charging paths: Stripe Billing + Checkout `mode: subscription` for recurring subscriptions; separate approved implementation orders use Checkout `mode: payment`. Neither path creates a second subscription to collect a service fee. Direct PaymentIntent charging and Metronome are outside this scope.

US charges need Stripe Tax with an **active registration** before `automatic_tax` collects anything.

---

## Local mirror and Console diagnostics

Stripe owns monetary subscription state. `FacilityBilling` and `FacilityDepartmentEntitlement` are Vssyl’s local access mirror. Stripe webhooks are the normal synchronization path. Vssyl Console **Sync from Stripe** is a manual recovery path that reuses the same Stripe → Vssyl reconciliation logic; Console does not edit subscriptions, set billing status by hand, or replace Stripe Dashboard. See [Console billing diagnostics certification](../console/CONSOLE_BILLING_DIAGNOSTICS_CERTIFICATION_2026-10-07.md).

Production onboarding is operator-assisted. Harbor OWNER **provisions a Facility shell**; the Facility Administrator completes `/setup`, product selection, and checkout. See [Assisted Facility Provisioning](../console/ASSISTED_FACILITY_PROVISIONING_2026-10-11.md). Public signup stays off in production unless explicitly enabled.

## Enforcement

Entitlement tables may exist while `BILLING_ENTITLEMENTS_ENABLED` is off. Existing facilities stay `UNMANAGED` (grandfathered) for **AVAILABLE** installed products. DEVELOPMENT products stay hidden regardless of this flag. Do not hide Healthcare Food & Nutrition behind purchase until that flag is an explicit product launch.

## Subscription transitions and setup acknowledgement (ONB-02, October 17, 2026)

This policy was explicitly approved for ONB-02. `onboardingCompletedAt` acknowledges the guided Facility setup journey. It grants no license, installation, configuration publication, or operational launch. An empty-location finish follows the same acknowledgement policy as every other finish path; neither a saved card nor missing Stripe keys grants access.

- **ACTIVE** (including Stripe `trialing` under the existing mapping): valid selected AVAILABLE Products may be licensed and installed. Installation is separate from successful payment synchronization and may require safe retry.
- **PAST_DUE:** retain only existing installed, licensed Department access until Stripe leaves `past_due`. Block new Department purchases and installations. No application-defined grace clock extends this state beyond Stripe's current status.
- **Scheduled cancellation:** retain otherwise-valid access until cancellation actually takes effect. `cancel_at_period_end` does not override unpaid/paused status, explicit revocation, inactive installation, release restrictions, or customer authorization.
- **CANCELED, UNPAID, PAUSED** (Stripe `canceled`/`incomplete_expired`, `unpaid`, and `paused` respectively): suspend licensed Department operation. Keep data, history, and account access needed to resolve billing. These states are not past-due grace. **INCOMPLETE** grants no license or installation.
- **Enforcement off:** grandfathering applies only to pre-existing AVAILABLE installations without explicit revocation. It cannot restore canceled/unpaid/paused paid access, authorize new installations, or expose DEVELOPMENT Products. Enabling enforcement remains a separate product-launch decision; this phase does not toggle it. No retrospective charges or readiness backfill.
- **Pilot exceptions:** none introduced. Permission to waive an assisted-setup service fee is not permission for free subscription access.

Webhook, checkout return, and Console Sync from Stripe must use the same current-subscription reconciliation owner. A retrieved checkout or historical invoice is not current payment proof. Mirror synchronization may commit before installation; report pending/failure honestly and retry reconciliation/installation without creating another checkout, subscription, or charge. Customer selection and Build/Run boundaries use the same commercial eligibility owner; a navigation link or journey timestamp is never authorization.

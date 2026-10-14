# Console Billing Operations — Phase Plan

**Date:** 2026-10-07  
**Mode:** PLAN (superseded for shipping scope)  
**Status:** Partially certified — **diagnostics only**  
**Classification:** SUPPORTING  
**Canonical commercial policy:** [11 — Commercial Model](../product/11_COMMERCIAL_MODEL.md) (ADL-013)  
**Department Product contract:** [13 — Department Product](../product/13_DEPARTMENT_PRODUCT.md)  
**UI name:** Vssyl Console (`/console`). Internal code may still say Harbor.

**Certified slice (2026-10-07):** [CONSOLE_BILLING_DIAGNOSTICS_CERTIFICATION_2026-10-07.md](./CONSOLE_BILLING_DIAGNOSTICS_CERTIFICATION_2026-10-07.md)  
That slice implements Phase **1A only** (customer detail Stripe identity + Sync from Stripe using the canonical webhook reconciliation path). It does **not** implement complimentary grants, adjustment ledgers, plan mutators, coupons, credits, or enforcement rollout. Do not treat the rest of this plan as authorized work.

This plan originally answered:

> What is the smallest set of Console capabilities that lets platform staff see, grant, and correct a facility subscription without creating a second charging system?

**Current product decision for shipping:** Stripe owns money. Vssyl owns the local access/entitlement mirror. Console helps staff inspect and repair Stripe → Vssyl synchronization. Console must not become a Stripe Dashboard replacement.

**Verdict:** `1A CERTIFIED` — later phases remain `NOT AUTHORIZED` until explicitly started.

This document does not enable `BILLING_ENTITLEMENTS_ENABLED`, does not add org/multi-site billing, and does not give Plant a Stripe SKU.

---

## A. Executive verdict

```text
READY WITH CONSTRAINTS
```

Stripe already charges. Vssyl already mirrors status and licensed departments. Console already **shows** billing and already **queues** payment problems. The gap is that staff cannot inspect Stripe identity, cannot repair drift, cannot grant pilot access, and cannot change a paying plan without impersonating a facility administrator or using Stripe Dashboard by hand.

**Constraints**

1. Stripe owns **money**. Vssyl owns **access**. Console never writes `FacilityBilling.status = ACTIVE` unless Stripe already has (or just received) that subscription.
2. Do **not** overload `UNMANAGED`. That status means grandfathered / not sold yet. Intentional no-charge access is a new status: `COMPLIMENTARY`.
3. Do **not** mix complimentary departments onto a paying Stripe subscription as a local grant. A facility is one commercial mode at a time. Comping a department on a paying site is a Stripe coupon / item change (Phase 3), not a hybrid row.
4. Licensed department **identity** lives in Stripe subscription metadata (`departmentKeys`). Price is count-based (`ltc_*` lookup keys). Stripe line items cannot tell Dietary from EVS. Dashboard edits that change items without metadata will drift. Console mutations must write **items and metadata together**.
5. Keep `/admin/billing` denied in Harbor work sessions. Staff billing work happens on the Console customer page, not inside the customer app.
6. `BILLING_ENTITLEMENTS_ENABLED` stays off until Phase 4 is explicitly certified. Granting entitlements is still useful before enforcement: `resolveCommercialEntitlement` already honors `ACTIVE` entitlement rows.
7. OWNER-only for grants and Stripe mutations. MEMBER may view and request a Stripe sync.
8. Every mutation requires a reason and an append-only adjustment row. Stripe Dashboard is not the Vssyl audit trail.

---

## B. Current truth

### What already exists

| Layer | Behavior |
|---|---|
| Customer `/admin/billing` | Checkout (`mode: subscription`), add departments via `stripe.subscriptions.update`, Customer Portal for card / invoices / cancel-at-period-end |
| Stripe webhooks | `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed` → `applyFacilitySubscription` |
| Local mirror | `FacilityBilling` + `FacilityDepartmentEntitlement`; install follows ACTIVE / PAST_DUE entitlement ([13](../product/13_DEPARTMENT_PRODUCT.md)) |
| Grandfathering | `UNMANAGED` ignored by enforcement; existing installs stay operable while the flag is off |
| Console Customers | Read-only table. Copy: “Every facility. Read-only.” |
| Console customer detail | Billing status, setup path, licensed departments. Open facility / ticket. No Stripe IDs, no sync, no edit |
| Console Today | Payment-problem queue for `PAST_DUE` / `INCOMPLETE` |
| Work session | `/admin/billing` and `/api/billing` are denied |
| Audit | `HarborAuditEvent` records `VIEW_CUSTOMER` with no payload, no reason |

### Gaps this program closes

| Gap | Why it matters |
|---|---|
| Console cannot see Stripe customer / subscription IDs | Staff cannot tell “No billing record” from “Stripe exists, webhook missed” |
| Sync-from-Stripe is only on the customer billing page | Console Today sends staff to a page that cannot repair drift |
| No complimentary / pilot grant | Early pilots, reference sites, and internal facilities have no first-party path except leaving them `UNMANAGED` forever |
| No staff path to add/remove licensed departments on a paying sub | Requires facility-admin login or a Dashboard edit that can desync `departmentKeys` |
| No coupon / credit / pause from Console | Goodwill and sales deals live only in Stripe Dashboard |
| `HarborAuditEvent` cannot store reason or before/after | Who granted what is not reconstructable |
| Entitlement sync trusts metadata only | Empty `departmentKeys` on sync is a no-op; item-only Dashboard edits do not update licenses |
| Enforcement flag unused | Correct, until grants and grandfathering are operable from Console |

### Gaps this program does **not** close

- Organization invoice, portfolio discounts, committed-site tiers ([11](../product/11_COMMERCIAL_MODEL.md) “Multi-site (later)”)
- Per-department Stripe Prices
- Metronome / usage billing
- Customer-visible coupon codes at Checkout (optional later; not required to operate)
- Selling DEVELOPMENT products
- A Plant-specific SKU (Plant is AVAILABLE; packaging remains a separate commercial decision)
- Enabling commercial enforcement in production as a side effect of shipping Console UI

---

## C. Architecture lock

```text
Vssyl Console (staff)
        │
        ├─ read  → FacilityBilling + entitlements + Stripe IDs
        ├─ sync  → Stripe API → applyFacilitySubscription
        ├─ grant → COMPLIMENTARY entitlements (no Stripe charge)
        └─ mutate paying plan → Stripe Subscription API
                                      │
                                      ▼
                               Stripe Billing
                                      │
                               webhooks / sync
                                      ▼
                    FacilityBilling + FacilityDepartmentEntitlement
                                      │
                                      ▼
                         installDepartmentProduct
```

### Commercial modes (one per facility)

| Mode | `FacilityBilling.status` | Stripe subscription | Entitlement source |
|---|---|---|---|
| Not sold / grandfathered | `UNMANAGED` or no row | none required | Enforcement-off grandfathering of installed AVAILABLE products |
| Complimentary | `COMPLIMENTARY` | none required | ACTIVE entitlement rows written by Console grant |
| Stripe-managed | `INCOMPLETE` / `ACTIVE` / `PAST_DUE` / `CANCELED` | required for ACTIVE / PAST_DUE | Stripe metadata `departmentKeys` mirrored locally |

Conversion is allowed. Hybrid is not:

- Complimentary → paying: start Checkout (or staff-created Stripe subscription) for the granted keys. Webhook replaces `COMPLIMENTARY` with `ACTIVE`.
- Paying → complimentary: cancel Stripe at period end, then grant. Do not leave an ACTIVE Stripe sub while status is `COMPLIMENTARY`.
- Paying + “throw in EVS free”: Phase 3 Stripe coupon / 100% off additional-department item. Metadata still lists EVS. Local grant on an ACTIVE Stripe facility is refused.

### Money vs access

| Question | Authority |
|---|---|
| How much do we charge? | Stripe (Prices, coupons, credits, pauses, invoices) |
| Which departments are licensed? | Vssyl entitlements, kept in sync with Stripe metadata on paying sites |
| May the customer operate the Product? | Entitlement + release state + install ([13](../product/13_DEPARTMENT_PRODUCT.md)) |
| Was this a staff exception? | `FacilityBillingAdjustment` |

### Who may act

| Action | MEMBER | OWNER |
|---|---|---|
| View billing panel | yes | yes |
| Sync from Stripe | yes | yes |
| Open Stripe Dashboard link | yes | yes |
| Grant / revoke complimentary | no | yes |
| Add / remove departments on a paying sub | no | yes |
| Apply allowlisted coupon, pause, credit | no | yes |
| Convert complimentary → Checkout | no | yes |
| Flip `BILLING_ENTITLEMENTS_ENABLED` | n/a — env / launch, not a Console toggle |

---

## D. Recommended schema (forward-only, when a phase needs it)

Do not migrate in Phase 1A. Introduce additive columns only when that phase starts.

### Phase 1B / 2A

```text
FacilityBillingStatus += COMPLIMENTARY

FacilityBillingAdjustment
  id
  facilityId
  staffId
  kind            GRANT | REVOKE | CONVERT_TO_PAID | SYNC
                  ADD_DEPARTMENTS | REMOVE_DEPARTMENTS
                  APPLY_COUPON | PAUSE | CREDIT | CANCEL
  reason          String (required, 8–500 chars)
  fromStatus      FacilityBillingStatus?
  toStatus        FacilityBillingStatus?
  departmentKeys  String[]   // intended licensed set after the action
  stripeCustomerId       String?
  stripeSubscriptionId   String?
  stripeCouponId         String?
  createdAt
```

Keep `HarborAuditEvent` for Console presence (`VIEW_CUSTOMER`, later `BILLING_ADJUST`). Do not use it as the commercial ledger; it has no payload today.

`FacilityBilling.stripeSubscriptionId` stays null on `COMPLIMENTARY`.

---

## E. Phases

Ship in order. Each phase is separately certifiable. Do not start N+1 until N is certified.

### Phase 1A — Visibility and Stripe truth

**Purpose:** Staff can see the same commercial facts Stripe has, and repair a missed webhook, without changing access.

**In**

- Customer detail **Billing** section: status, interval, setup path, licensed departments, Stripe customer id, Stripe subscription id, “No Stripe customer” vs “No billing record”.
- MEMBER+ **Sync from Stripe** reuses `syncFacilityBillingFromStripe`.
- External links to Stripe Dashboard customer and subscription (test vs live). Not an embedded Stripe UI.
- Customers table stays a list; it does not become an editor. Copy may change from “Read-only.” to “Billing is managed on the facility page.”
- Today payment-problem rows still link here.

**Out**

- Any grant, coupon, add-department, or local status write except via sync.
- Work-session access to `/admin/billing`.

**Sync hardening (still read-path)**

- If Stripe has an active/past_due subscription and `departmentKeys` metadata is empty, show an explicit **metadata missing** warning. Do not invent keys from item quantity.
- Do not map Stripe `paused` onto a new local status in 1A; keep today’s `PAST_DUE` mapping.

**Schema:** none.  
**Tests:** hermetic presentation labels; DB test that Console sync calls the existing Stripe sync and does not write `ACTIVE` without a Stripe sub; work-path deny list unchanged.

---

### Phase 1B — Adjustment ledger

**Purpose:** Later mutations have somewhere honest to land.

**In**

- `FacilityBillingAdjustment` table.
- Customer Billing section lists recent adjustments (staff, kind, reason, time).
- Sync from Stripe writes a `SYNC` row when status or licensed keys change. No-op syncs write nothing.
- `HarborAuditAction` += `BILLING_ADJUST` (optional dual-write).

**Out**

- User-facing grant/mutate forms.

**Schema:** additive table + optional audit enum value. No status enum change yet.

---

### Phase 2A — Complimentary / pilot grant

**Purpose:** First-party access without a card. This is the manipulator for **non-paying** sites.

**In**

- OWNER form on the customer page: select AVAILABLE Department Product keys, required reason, confirm.
- Sets `FacilityBilling.status = COMPLIMENTARY`, writes ACTIVE entitlements, runs the existing install-for-entitlements path.
- Revoke selected keys, or revoke all (status returns to `UNMANAGED` if nothing remains licensed).
- Refuse if the facility is Stripe-managed (`ACTIVE` / `PAST_DUE` / `INCOMPLETE`). Staff must cancel or convert first.
- Refuse DEVELOPMENT keys.
- Enforcement, when later enabled, treats `COMPLIMENTARY` like `ACTIVE` for those entitlement rows only — not as blanket grandfathering.

**Out**

- Creating a $0 Stripe subscription “to keep Stripe in the loop.” Conversion is Phase 2B.
- Customer-facing copy that they have a paid plan.
- Comping one department on an already-paying facility.

**Amend [11](../product/11_COMMERCIAL_MODEL.md) when this ships:** complimentary / pilot grant is a Console OWNER action; it is not Checkout; it is not `UNMANAGED`.

**Schema:** `FacilityBillingStatus.COMPLIMENTARY`; entitlement helpers and STATUS_COPY.  
**Tests:** grant installs; revoke stops entitlement; Stripe-managed facility refused; MEMBER refused; adjustment row required; `isDepartmentLicensed` / `resolveCommercialEntitlement` with enforcement on.

---

### Phase 2B — Convert complimentary → paying

**Purpose:** A pilot that should start paying uses the same Checkout path as any facility.

**In**

- OWNER **Start checkout for this facility** using current complimentary keys (interval + setup path selectable).
- Creates a Stripe Checkout session the way `/admin/billing` does, with the facility’s Stripe customer (create if needed).
- Success webhook: `applyFacilitySubscription` → `ACTIVE`. Complimentary mode ends.
- Optional: email the Checkout URL to `billingEmail` instead of completing in the staff browser.

**Out**

- Staff entering card data into Console.
- Changing list prices.

Reuse `startBillingCheckoutAction` internals; do not fork quote math.

---

### Phase 3A — Paying-plan manipulator

**Purpose:** Staff can change a **Stripe-managed** subscription without Dashboard metadata drift.

**In** (OWNER, reason required)

| Action | Implementation |
|---|---|
| Add licensed departments | Reuse `addDepartmentsToFacilitySubscription` (items + metadata + proration) |
| Remove licensed departments | Inverse: requote, `subscriptionItemUpdates`, rewrite `departmentKeys`, proration as documented |
| Waive assisted setup | Do not add setup line items; record adjustment. Do not invent a negative invoice unless Stripe credit is also issued |
| Apply allowlisted coupon | `stripe.subscriptions.update` with a configured coupon id (env or catalog). No arbitrary Dashboard coupon picker in v1 |
| Pause collection | Stripe pause; local status follows webhook (`PAST_DUE` until a dedicated PAUSED status is justified) |
| Credit / refund | Stripe credit note / refund API; local ledger stores the Stripe id. No local “mark paid” |

**Out**

- Local ACTIVE without Stripe success.
- Arbitrary price overrides typed in Console (“charge them $50”). Custom amounts stay Stripe Dashboard or a later quoted custom Price.
- Org-level portfolio discount math.

**Rule:** Stripe call succeeds first. Local mirror updates from the Stripe response **and** the webhook remains idempotent.

---

### Phase 3B — Customer-portal completeness (optional)

Only if facility admins need the same tools without calling support.

**Candidates:** allow subscription-update in Customer Portal, promotion codes on Checkout, self-serve interval change.

Not required to operate Console grants. Defer unless support volume says otherwise.

---

### Phase 4 — Enforcement certification

**Purpose:** Turn `BILLING_ENTITLEMENTS_ENABLED` on in a named environment without hiding Healthcare Food & Nutrition by accident.

**In**

- Checklist: every production facility is `UNMANAGED` (grandfather), `COMPLIMENTARY` (granted keys), or Stripe-managed with metadata keys matching entitlements.
- Console report: facilities that would lose an installed AVAILABLE product under enforcement.
- Explicit product launch decision per [11](../product/11_COMMERCIAL_MODEL.md): “Do not hide Healthcare Food & Nutrition behind purchase until that flag is an explicit product launch.”

**Out**

- Flipping the flag as part of shipping 1A–3A.
- Auto-converting `UNMANAGED` to `COMPLIMENTARY`. Grandfathering stays `UNMANAGED`.

---

## F. Will-not-do (this program)

- A Console slider that sets `ACTIVE` on `FacilityBilling` with no Stripe object.
- Work-session billing impersonation.
- Second charging ledger (Metronome, in-app invoices, “house account” balances).
- Per-seat or per-room prices.
- Multi-site org invoice / committed-site discounts.
- Editing Stripe Prices from Console.
- Comping DEVELOPMENT products into customer operability.

---

## G. Implementation notes (when a phase starts)

- Presentation labels for `COMPLIMENTARY`: **Complimentary** in Console; never “Active” (that word means paid).
- Customer `/admin/billing` for a complimentary facility: not a paid plan; offer checkout when they are ready. Do not show “Manage billing” as if invoices exist.
- Quote math stays in `src/lib/billing/quote.ts`. Console must not hardcode $299 / $149.
- Plant may be granted as a department key under count-based pricing. Do not add a Plant Stripe Product in this program.
- Language: **licensed departments**, not licenses-as-seats. `showInEmployeeApp` is not a license.

### Suggested code homes

| Concern | Home |
|---|---|
| Console billing panel | `src/app/console/(staff)/customers/[facilityId]/` |
| Staff billing actions | `src/app/console/(staff)/customers/actions.ts` (new) |
| Grant / convert / mutate | `src/lib/billing/` — new `grant.ts`, reuse `add-departments.ts`, `sync-from-stripe.ts` |
| Adjustment ledger | `src/lib/billing/adjustments.ts` |
| Entitlement | `src/lib/billing/entitlement.ts` + `src/lib/department-products/eligibility.ts` |

---

## H. Certification per phase

Each phase ends with a short `docs/console/CONSOLE_BILLING_OPERATIONS_PHASE_*_CERTIFICATION_YYYY-MM-DD.md` recording:

- Schema (none / additive)
- OWNER vs MEMBER matrix
- Stripe vs local write order
- Tests run (hermetic + DB; Playwright only if the customer page UI is in that phase)
- Explicit non-claims (enforcement still off, org billing still later)

Phase 1A browser check: Console customer page shows Stripe ids and Sync; work session still cannot open `/admin/billing`.

---

## I. Suggested start order

```text
1A Visibility + sync     ← start here; no commercial-policy change
1B Adjustment ledger     ← schema for everything after
2A Complimentary grant   ← first true manipulator (access)
2B Convert to paying     ← first manipulator that creates Stripe money
3A Paying-plan mutate    ← first manipulator that changes Stripe money
4  Enforcement           ← launch decision, not a UI feature
```

**Do not skip to 3A.** Without 1A, staff will keep using Dashboard and will keep desyncing metadata. Without 2A, pilots stay invisible `UNMANAGED` rows. Without 1B, grants have no audit.

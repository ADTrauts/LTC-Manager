# 11 — Commercial Model

**Status:** Binding product policy (ADL-013)  
**List prices:** Working figures; first paying facilities may validate them  
**Does not:** Gate departments until `BILLING_ENTITLEMENTS_ENABLED`. Administrators start Stripe Checkout from `/admin/billing`.

---

## What we sell

One product. Unlimited users at every role. Price follows **licensed operational departments** at a facility.

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

## Setup fee (optional)

| Path | Fee |
|---|---|
| Self-setup (`/setup`) | $0 — subscription only |
| Assisted implementation | ~$1,500 first department, ~$500 each additional |

Assisted setup is a service they choose, not a tax on every customer. Early pilots may still have assisted setup waived for structured feedback and a reference.

---

## Multi-site (later)

One agreement and invoice at the **organization**. Each facility is a licensed site using the same department math. Portfolio discount applies only to **contractually committed** sites (none below 5; 10% at 5; 15% at 10; 20% at 25; negotiated around 25% at 50+).

Stripe customer remains on `Facility` until org billing is scoped.

---

## Stripe catalog

Separate Products (not Prices on one Product):

1. **LTC Manager — Facility** (includes first department) — monthly + annual Prices  
2. **LTC Manager — Additional department** — monthly + annual Prices  
3. **LTC Manager — Whole facility** — monthly + annual Prices (used when list would exceed $999)  
4. **LTC Manager — Assisted setup (first department)** — one-time  
5. **LTC Manager — Assisted setup (additional department)** — one-time  

Charging path: Stripe Billing + Checkout `mode: subscription`. Not PaymentIntents. Not Metronome.

US charges need Stripe Tax with an **active registration** before `automatic_tax` collects anything.

---

## Enforcement

Entitlement tables may exist while `BILLING_ENTITLEMENTS_ENABLED` is off. Existing facilities stay `UNMANAGED` (grandfathered). Do not hide Dietary / EVS / Plant behind purchase until that flag is an explicit product launch.

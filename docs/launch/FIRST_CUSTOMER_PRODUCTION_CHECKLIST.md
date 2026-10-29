# First Customer — Production Configuration Checklist

**Status:** Operator checklist for the first paying Vssyl Facility  
**Launch posture:** operator-assisted, Food and Nutrition only  
**Companion:** [First Paying Customer Runbook](./FIRST_PAYING_CUSTOMER_RUNBOOK.md)

Do not put secrets, password values, or live Stripe IDs in tickets copied from this checklist.

This checklist does not change product behavior. It is the control for production configuration before Harbor provisioning.

---

## Official launch posture

| Decision | Production policy |
|---|---|
| Sales | Assisted |
| Provisioning | Harbor OWNER |
| Public signup | **OFF** |
| Billing enforcement | **OFF** |
| Customer setup | Facility Administrator completes `/setup` |
| Stripe payment | Normal `/setup` Checkout |
| Implementation | Operator-assisted |
| Support | Email + Harbor ticketing |
| Department sold initially | Food and Nutrition only |

Do not enable public signup. Do not enable billing entitlements enforcement. Do not sell Facility Plant Operations on this launch. The runbook is the HFN-only control; do not change the product catalog to hide Plant.

---

## 1. Database

- [ ] `DATABASE_URL` is set (runtime; pooler URL is OK)
- [ ] `DIRECT_URL` is set (direct Postgres for migrate; not the pooler)
- [ ] From an approved production checkout, apply pending migrations:

```bash
npx prisma migrate deploy
```

- [ ] Confirm `20261011210000_harbor_audit_provision_facility` is applied  
  (adds `HarborAuditAction.PROVISION_FACILITY`)
- [ ] `npx prisma migrate status` reports the production database is up to date

Never run `prisma migrate reset` against production. Never put connection strings in this document or in tickets.

---

## 2. Authentication and public origin

- [ ] `AUTH_SECRET` is set (unique production secret; required for sessions, PIN HMAC, Harbor Console, and auth rate-limit keys)
- [ ] The production app is served on the intended public HTTPS origin
- [ ] Invite and password-reset links resolve against that origin (`/accept-invite`, `/reset-password`)

Invite URLs are built from the incoming request origin (`x-forwarded-host` / `host`). Harbor provision falls back to `NEXT_PUBLIC_APP_URL` only when those headers are missing. Set `NEXT_PUBLIC_APP_URL` to the same public origin so Harbor invites cannot silently fall back to localhost.

Changing `AUTH_SECRET` invalidates existing sessions and Quick PIN digests. Do not rotate it during first-customer onboarding.

---

## 3. Signup and billing flags

- [ ] `PUBLIC_SIGNUP_ENABLED` is **unset or `false`**
- [ ] `BILLING_ENTITLEMENTS_ENABLED` is **unset or `false`**

Public signup defaults off in production unless explicitly set to `true` / `1`. Keep it off for operator-assisted launch.

Billing enforcement defaults off. Keep it off. It is not certified for:

- grandfathered / `UNMANAGED` Facilities
- cancellation entitlement cleanup

With enforcement off, a canceled customer may still operate. That is a commercial/operator control until a later enforcement phase. Do not flip the flag for first launch.

---

## 4. Stripe

### Required environment variables

- [ ] `STRIPE_SECRET_KEY` (live secret; not `sk_test_`)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (matching live publishable key)
- [ ] `STRIPE_WEBHOOK_SECRET` (signing secret for the **live** endpoint)
- [ ] `STRIPE_PRICE_FACILITY_MONTHLY`
- [ ] `STRIPE_PRICE_FACILITY_ANNUAL`
- [ ] `STRIPE_PRICE_ADDITIONAL_DEPT_MONTHLY`
- [ ] `STRIPE_PRICE_ADDITIONAL_DEPT_ANNUAL`
- [ ] `STRIPE_PRICE_WHOLE_FACILITY_MONTHLY`
- [ ] `STRIPE_PRICE_WHOLE_FACILITY_ANNUAL`
- [ ] `STRIPE_PRICE_SETUP_FIRST_DEPT`
- [ ] `STRIPE_PRICE_SETUP_ADDITIONAL_DEPT`

Setup-fee price IDs must still be configured (catalog completeness). `/setup` currently hardcodes `setupPath=SELF_SERVE`, so Checkout will **not** charge the assisted implementation fee. See the runbook for how that fee is handled commercially.

List prices: [11 — Commercial Model](../product/11_COMMERCIAL_MODEL.md).

### Webhook

- [ ] Live Stripe endpoint registered for `https://<production-origin>/api/billing/webhook`
- [ ] Endpoint uses the same webhook signing secret stored in `STRIPE_WEBHOOK_SECRET`

Events the current handler processes:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `setup_intent.succeeded`

Do not register events that are not in that list as if the app handled them.

### Live-mode verification (before first customer)

- [ ] Stripe Dashboard is the **live** account, not test mode
- [ ] Every `STRIPE_PRICE_*` value is a live price ID (`price_…` from live mode)
- [ ] No test-mode price IDs in production
- [ ] Facility (first department) monthly and annual prices match the commercial list
- [ ] Additional department monthly and annual prices match the commercial list
- [ ] Whole-facility ceiling prices match the commercial list
- [ ] Webhook signing secret belongs to the live endpoint, not a test endpoint

---

## 5. Email (hard launch dependency)

Outbound transactional mail is Postmark. If it is not configured, Harbor still creates the Facility, but the Facility Administrator cannot activate.

- [ ] `POSTMARK_SERVER_TOKEN` is set
- [ ] `POSTMARK_FROM_EMAIL` is a Postmark-verified sender (defaults to `noreply@vssyl.com` if unset; production should set it explicitly)
- [ ] Optional: `POSTMARK_MESSAGE_STREAM` (defaults to `outbound`)
- [ ] Postmark template alias `account-invite` exists and is active
- [ ] Postmark template alias `password-reset` exists and is active

Required flows that use those templates:

| Flow | Template | Link |
|---|---|---|
| Initial FA account invite | `account-invite` | `/accept-invite?token=…` |
| FA invite resend | `account-invite` | same |
| Employee account activation | `account-invite` | same |
| Employee activation resend | `account-invite` | same |
| Forgot-password / reset | `password-reset` | `/reset-password?token=…` |

Empty `POSTMARK_SERVER_TOKEN` skips send. Treat that as a launch blocker.

### Email preflight (not the real customer)

Use a Vssyl-controlled mailbox. Do not certify against the paying customer's inbox unless that send is intentional.

- [ ] Send an account invite to the test mailbox (Harbor provision of a throwaway Facility, or resend on a test user)
- [ ] Message delivers
- [ ] Activation link opens the **production** Vssyl origin (`/accept-invite`)
- [ ] Password can be created
- [ ] Forgot-password from `/forgot-password` delivers `password-reset`
- [ ] Reset link opens `/reset-password` on the same production origin

If any of those fail, stop. Do not onboard the paying customer until Postmark and origin are fixed.

---

## 6. Harbor OWNER bootstrap

Canonical script: `scripts/bootstrap-harbor-owner.mjs`  
Command: `npm run db:bootstrap-harbor-owner`

Required:

- `DATABASE_URL` (script reads `.env` then `.env.local`)
- `HARBOR_OWNER_BOOTSTRAP_PASSWORD` (min 12 characters; not a trivial password)

Optional:

- `HARBOR_OWNER_EMAIL` (script default if unset)
- `HARBOR_OWNER_DISPLAY_NAME`

- [ ] OWNER account created or updated
- [ ] Sign in at `/console/login` with that email
- [ ] Lands on `/console`

Do not record the password in this document, tickets, or chat.

---

## 7. Harbor preflight

As Harbor OWNER, before the first customer:

- [ ] Sign into Console (`/console/login`)
- [ ] Open **Customers** (`/console/customers`)
- [ ] See **New customer** (OWNER-only)
- [ ] Open **Provision Facility** (`/console/customers/new`)
- [ ] Open an existing customer detail (or provision a throwaway test Facility first)
- [ ] Confirm **Resend administrator invite** is available after a failed invite (`?invite=failed` on customer detail while the FA password is still unset)
- [ ] Confirm **Open in Stripe** appears once a Stripe customer/subscription exists
- [ ] Confirm **Sync from Stripe** is on customer detail
- [ ] Confirm **Open facility** starts a Harbor work session

Do not use `scripts/bootstrap-pilot-facility-admin.mjs` for the paying customer. That is a legacy pilot tool, not the commercial path. See [Assisted Facility Provisioning](../console/ASSISTED_FACILITY_PROVISIONING_2026-10-11.md).

---

## 8. Support path

Customer-facing support for this launch:

- Email: `support@vssyl.com`
- Harbor Console ticket tracking (`/console/tickets`)

No chat. Do not invent another address.

---

## 9. Go / no-go

Production is ready for Harbor provisioning of the first paying Facility only when:

- [ ] Database migrated, including `PROVISION_FACILITY` audit action
- [ ] `AUTH_SECRET` and public origin verified
- [ ] Public signup off
- [ ] Billing enforcement off
- [ ] Live Stripe prices and webhook verified
- [ ] Postmark invite + reset preflight passed
- [ ] Harbor OWNER can sign in, provision, and sync

Then follow the [First Paying Customer Runbook](./FIRST_PAYING_CUSTOMER_RUNBOOK.md).

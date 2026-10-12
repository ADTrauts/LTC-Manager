# First Paying Customer — Assisted Onboarding Runbook

**Status:** Operator runbook for the first paying Vssyl Facility  
**Product:** Healthcare Food & Nutrition only  
**Companion:** [Production Configuration Checklist](./FIRST_CUSTOMER_PRODUCTION_CHECKLIST.md)

Do this after the production checklist is complete. Do not start another product phase from this document.

Canonical policy this runbook executes:

- [01 — Product Constitution](../product/01_PRODUCT_CONSTITUTION.md)
- [11 — Commercial Model](../product/11_COMMERCIAL_MODEL.md)
- [13 — Department Product](../product/13_DEPARTMENT_PRODUCT.md)
- [Assisted Facility Provisioning](../console/ASSISTED_FACILITY_PROVISIONING_2026-10-11.md)
- [Universal Employee Identity Phase A](../security/USER_EMPLOYEE_IDENTITY_LINK_PHASE_2E2_2026-10-10.md)
- [Facility Builder / Department Builder](../product/LTC_MANAGER_BUILD_GUIDE.md)
- [RUN surfaces](../product/LTC_MANAGER_RUN_GUIDE.md)

---

## Launch posture (locked)

```text
Sales                 → assisted
Provisioning          → Harbor OWNER
Public signup         → OFF
Billing enforcement   → OFF
Customer setup        → Facility Administrator
Stripe payment        → normal /setup checkout
Implementation        → operator-assisted
Support               → email + Harbor ticketing
Department sold       → Healthcare Food & Nutrition only
```

Do not enable `PUBLIC_SIGNUP_ENABLED`. Do not enable `BILLING_ENTITLEMENTS_ENABLED`. Do not select Facility Plant Operations during `/setup`, even if it is visible/AVAILABLE. EVS is DEVELOPMENT and is not sold.

---

## 1. Qualify the customer

Do not provision until all of the following are true:

- [ ] Signed agreement
- [ ] Healthcare Food & Nutrition only (no Plant sale)
- [ ] Pricing confirmed (first department; monthly or annual)
- [ ] Billing contact confirmed
- [ ] Initial Facility Administrator identified (name + email)
- [ ] Facility legal / display name confirmed
- [ ] Parent Organization determined (create new, or use existing)
- [ ] Timezone confirmed

If they want Plant, stop. This launch does not sell it.

---

## 2. Parent Organization

Before Harbor **Provision Facility**, decide:

- **Create new Organization**, or
- **Use existing Organization**

If existing: copy the Organization ID from Harbor and verify it is the intended parent. Organization IDs are immutable. A wrong parent cannot be fixed by reassignment.

**Warning:** Facility ownership cannot currently be reassigned.

Harbor will ask the operator to confirm that the Facility will be owned by the selected Organization.

---

## 3. Harbor provisioning

1. Sign in at `/console/login` as Harbor OWNER.
2. **Customers** → **New customer** (`/console/customers/new`).
3. Enter:

   - parent Organization (new or existing)
   - Facility display name
   - timezone
   - billing email
   - initial FA name
   - initial FA email

4. Confirm ownership (and existing-user / duplicate-name prompts if shown).
5. **Provision Facility**.

Harbor creates the tenant shell only. It does **not** create Stripe billing, Departments, or entitlements.

---

## 4. Verify the provision result

On `/console/customers/{facilityId}`:

- [ ] Facility exists
- [ ] Setup is incomplete (`Setup not started` or `Setup: …`; **Live** is not set)
- [ ] Billing status = **No billing record**
- [ ] No Stripe customer / subscription on file
- [ ] Licensing: Healthcare Food & Nutrition = **Not licensed**
- [ ] Initial FA appears under People
- [ ] Banner says invite sent, **or** existing account received FA access, **or** invite failed with **Resend administrator invite**

If invite failed:

1. Stay on that customer page (or reopen it with `?invite=failed` while the FA still has no password).
2. **Resend administrator invite**.
3. If Postmark is broken, **stop**. Fix production email before continuing. Harbor does not roll back the Facility when mail fails.

---

## 5. Initial FA activation

Operator confirms the customer:

1. Receives the activation email (Postmark template `account-invite`).
2. Opens the activation link (`/accept-invite`) on the production Vssyl origin.
3. Sets a password.
4. Enters the Facility context.
5. Lands in `/setup`.

If email fails, stop onboarding until Postmark/config is fixed. Do not invent a workaround password.

---

## 6. Walk `/setup` with the FA

### Facility

Confirm:

- Facility name
- billing email

Do not overconfigure.

### Managers

Managers are optional. If the customer knows managers, invite them. If not, continue. This is not a launch gate.

### Products

Select **only** Healthcare Food & Nutrition.

Do **not** select Facility Plant Operations, even if it is listed.

Product selection is stored in browser `sessionStorage` (`vssyl.setup.departmentProductKeys`). If selected products disappear:

1. Return to the Products step.
2. Reselect Healthcare Food & Nutrition.
3. Continue.

Do not treat this as a data-loss mystery in Stripe. Nothing has been purchased yet.

### Checkout

1. Choose monthly or annual.
2. Start Stripe Checkout.
3. Customer completes payment.
4. Return to `/setup`.

Expected Stripe facts after a successful first-department purchase:

- one Facility
- one subscription
- metadata `facilityId` = this Facility
- metadata `departmentKeys` = `DIETARY` (install key for Healthcare Food & Nutrition)
- metadata `interval` = `MONTHLY` or `ANNUAL`
- metadata `setupPath` = `SELF_SERVE`

`/setup` hardcodes `SELF_SERVE`. That is current product behavior.

### Assisted implementation fee

`/setup` does not charge the assisted implementation fee.

For this first customer, assisted implementation is:

- **waived**, or
- **invoiced / handled separately outside `/setup`**

Align with the signed agreement. Early pilots may have assisted setup waived ([Commercial Model](../product/11_COMMERCIAL_MODEL.md)). Do not try to force `ASSISTED` through the setup wizard.

---

## 7. Verify Stripe (do not trust the success page)

In Stripe (Harbor **Open in Stripe**, or Dashboard):

- [ ] Stripe customer exists
- [ ] Subscription exists
- [ ] Status is active
- [ ] `facilityId` metadata matches the Harbor Facility ID
- [ ] `departmentKeys` contains `DIETARY` (Healthcare Food & Nutrition)
- [ ] `interval` matches what the customer paid
- [ ] `setupPath` is `SELF_SERVE`

---

## 8. Verify the Vssyl billing mirror

Harbor customer detail should show:

- [ ] Billing status **Active**
- [ ] Stripe Customer ID present
- [ ] Stripe Subscription ID present
- [ ] Healthcare Food & Nutrition **Licensed**
- [ ] Setup path **Self-serve**

If Stripe is correct but Harbor still shows **No billing record**:

**Sync from Stripe**.

Then re-check FacilityBilling, entitlement, and Department.

---

## 9. Verify Department install

- [ ] Healthcare Food & Nutrition entitlement is ACTIVE (Harbor: **Licensed**)
- [ ] Dietary Department is installed (`Department.key = DIETARY`; customer name defaults to **Dietary**)

Confirm inside the Facility (Harbor **Open facility**, then Department Builder / department list). Harbor licensing is the entitlement mirror; it is not the Department row.

If licensed is missing or Dietary is missing:

1. Harbor → **Sync from Stripe**
2. Re-check

No SQL.

---

## 10. Setup completion vs operational readiness

Locations can currently be skipped. Completing `/setup` sets `onboardingCompletedAt` and Harbor may label the Facility **Live**.

**Do not treat `onboardingCompletedAt` / Harbor “Live” as operational readiness.**

The operator decides whether locations are:

- entered during `/setup`, or
- configured immediately afterward in Facility Builder

For the first customer, Facility structure must be completed **before live use**, even if the wizard allows skip.

---

## 11. Facility Builder (minimum structure)

Operator assists the FA in BUILD → Facility Builder (`/admin/facility/builder`).

Certified physical model:

```text
Floors
  → Neighborhoods / Units
    → Rooms / Spaces
```

Do not rediscover HFN architecture here. Follow [Facility Builder](../product/LTC_MANAGER_BUILD_GUIDE.md) and [Product Constitution](../product/01_PRODUCT_CONSTITUTION.md).

---

## 12. Department Builder (minimum HFN)

Operator assists in Department Builder (`/admin/departments`) for the Dietary / Healthcare Food & Nutrition Department:

- Locations (location functions / responsibility against the Facility tree)
- Operational Cycles / operating rhythm (apply starter, edit, **publish**)
- required operational work / records

Nothing is auto-published. Follow [13 — Department Product](../product/13_DEPARTMENT_PRODUCT.md) and the constitution. Do not rewrite HFN setup in this runbook.

---

## 13. Employee onboarding

Customer managers add people from **Employees** → **Add employee**.

Phase A rules:

- email is required
- a global Vssyl User is created or reused
- PIN is assigned for eligible employees
- activation invite is sent if the User is new / not yet activated

**No CSV new creates** for the first customer. CSV import updates existing Employees only. For a large roster, use assisted / manual Add employee. Do not build CSV create.

Identity detail: [Phase 2E2 / Phase A](../security/USER_EMPLOYEE_IDENTITY_LINK_PHASE_2E2_2026-10-10.md).

---

## 14. Employee activation

- Activation pending → PIN works during the 30-day grace (`User.createdAt` + 30 days UTC; resend does not extend grace)
- Invite token remains 7 days and refreshes on resend
- If the invite is lost: Employees → **Resend activation**
- After 30 days without activation: PIN is blocked with **Account activation required**

---

## 15. First live-day readiness

Before live use, operator verifies:

- [ ] FA account working
- [ ] Manager access working (if managers were invited)
- [ ] At least one employee / PIN working
- [ ] Healthcare Food & Nutrition entitlement ACTIVE and Dietary Department installed
- [ ] Facility structure sufficient for the first operating day
- [ ] Operational Cycles published
- [ ] Required logs / work configured
- [ ] Tablet / device access proven on the production origin

Use currently certified HFN operating requirements. Device notes: [Dietary device readiness](../deployment/DIETARY_V1_DEVICE_READINESS_CHECKLIST.md). Do not rebuild certification in this runbook.

---

## 16. First live-day walkthrough

Operator observes (only certified surfaces):

- [ ] Email/password login
- [ ] Quick PIN
- [ ] Dashboard
- [ ] Location navigation (Floors → Neighborhoods / Units)
- [ ] Operational cycle / meal-period context if published
- [ ] Log completion
- [ ] Readiness / meal-period behavior if configured
- [ ] Review

See [RUN Guide](../product/LTC_MANAGER_RUN_GUIDE.md).

---

## 17. Failure recovery

| Failure | Recovery |
|---|---|
| FA invite fails | Harbor customer detail → **Resend administrator invite** (`?invite=failed` while invite still pending). If Postmark is down, fix environment first. Do not continue. |
| Checkout canceled | Remain on `/setup` billing. Retry Checkout. No entitlement or Department install is expected. |
| Payment succeeds but Vssyl still says no billing | Harbor customer detail → verify Stripe subscription → **Sync from Stripe**. Recheck FacilityBilling, entitlement, Department. |
| Subscription ACTIVE but Department missing | **Sync from Stripe**, then recheck Dietary install in the Facility. No SQL. |
| Product selection disappeared | Return to Products → reselect Healthcare Food & Nutrition → continue. Selection is `sessionStorage`. |
| Customer skipped locations | Finish Facility Builder before live use. Harbor **Live** is not operational readiness. |
| Employee activation missing | Employees → **Resend activation**. PIN still works during 30-day grace. |
| `PAST_DUE` later | Facility remains operationally usable. This is intentional healthcare-operational grace. Collect through Stripe / the commercial process. |
| Subscription canceled | With enforcement off, the customer may technically continue operating. Treat as **commercial / operator contract control**. Cancellation does **not** automatically disable software. |

### Invalid Stripe metadata

If **Sync from Stripe** reports `METADATA_INCOMPLETE`, `UNKNOWN_DEPARTMENT_KEYS`, or `CONFLICTING_SUBSCRIPTIONS`:

1. Inspect Stripe (customer, subscription, `facilityId`, `departmentKeys`).
2. Correct the commercial exception deliberately in Stripe.
3. Sync again.

Do not repair the local database by hand. Do not add metadata-repair product functionality.

---

## 18. Support

First-launch customer support:

- `support@vssyl.com`
- Harbor Console ticket tracking (`/console/tickets`, **Open ticket** on the customer)

No chat.

---

## 19. Go-live checklist

### Commercial

- [ ] Agreement signed
- [ ] Payment complete
- [ ] Billing **Active**
- [ ] Healthcare Food & Nutrition licensed

### Technical

- [ ] Production config verified ([checklist](./FIRST_CUSTOMER_PRODUCTION_CHECKLIST.md))
- [ ] Email working
- [ ] FA activated
- [ ] Stripe webhook working
- [ ] Billing mirror correct
- [ ] Dietary / Healthcare Food & Nutrition Department installed

### Operational

- [ ] Facility structure ready
- [ ] HFN Department configured
- [ ] Operational Cycles published
- [ ] Staff access proven
- [ ] First live-day walkthrough complete

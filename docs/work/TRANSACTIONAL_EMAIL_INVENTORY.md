# Transactional email inventory

**Product:** Vssyl  
**Mailer:** Postmark (`src/lib/email`)  
**Layout:** Postmark alias `vssyl-transactional`  
**Rule:** User-facing copy says **Vssyl** / **Vssyl Console**. Internal code may still say `harbor`.

---

## Live

| Email | Trigger | Template alias | Status |
|-------|---------|----------------|--------|
| Onboarding manager invite | Setup wizard saves new manager emails | `onboarding-manager-invite` | Live (Postmark template + app) |
| Password reset | `/forgot-password` for facility `User` accounts | `password-reset` | Live (Postmark template + app) |
| Signup email verification | Public `/signup` when Postmark is configured | `signup-email-verification` | Live (Postmark template + app) |
| Account invite | Admin creates EMAIL_PASSWORD employee / promotion | `account-invite` | Live (Postmark template + app) |
| Console ticket reply | Staff replies on a Vssyl Console ticket | `console-ticket-reply` | Live (Postmark template + app) |

---

## Next (recommended order)

| Email | Trigger | Needs before send | Notes |
|-------|---------|-------------------|-------|
| — | Inventory is current | — | Add a row here before the next mailer |

---

## Later / optional

| Email | Notes |
|-------|-------|
| HR / ops summaries | Roadmap optional |
| Billing receipts | Prefer Stripe-owned customer emails |

---

## Do not build as product mail

- In-app notifications inbox (product boundary)
- SMS / push (future integration, not Postmark)

---

## Adding a new email

1. Create a **Standard** template in Postmark under layout `vssyl-transactional`.
2. Add a thin sender in `src/lib/email/` that calls `sendTemplatedEmail`.
3. Wire the product action; keep DB writes successful if mail is off or fails.
4. Document the row in this inventory.

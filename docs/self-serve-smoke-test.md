# Self-Serve Onboarding Smoke Test

Use this checklist before each deploy that touches signup, setup, or billing.

## Prerequisites

- `AUTH_SECRET` is set.
- Stripe env vars are set: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- Prisma migrations are applied.

## Checklist

- Visit `/` while logged out and confirm hero page renders with `Start free setup`.
- Go to `/signup`, create a facility/admin account, and confirm redirect to `/setup`.
- In setup step 1, update facility name + optional managing partner + billing email; continue.
- In setup step 2, save at least one manager email and continue.
- In setup step 3, add at least one location and continue.
- In setup step 4, add card details and confirm billing submit succeeds.
- Confirm redirect to `/dashboard?onboarding=complete`.
- Confirm setup completion card appears on dashboard with next actions.
- Log out, log back in as GM, and confirm you are no longer redirected to `/setup`.

## Resume Behavior

- Start setup, close browser before finishing.
- Log back in and confirm `/setup` reopens at saved step.

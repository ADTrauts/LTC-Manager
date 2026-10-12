# Assisted Facility Provisioning

**Date:** 2026-10-11  
**Classification:** SUPPORTING  
**Canonical commercial policy:** [11 — Commercial Model](../product/11_COMMERCIAL_MODEL.md)

## Verdict

Harbor OWNER can provision a customer shell. The Facility Administrator completes `/setup`.

```text
Harbor provisions tenant shell
Facility Administrator completes /setup
```

## Permanent splits

```text
Facility Administrator ≠ Organization Administrator
Organization membership ≠ Facility access
Harbor staff ≠ tenant authority
```

## What Harbor creates

- Parent Organization (new or existing)
- Facility
- Initial Facility Administrator User (new invite or existing reuse)
- UserFacilityAccess + current FA role period
- Facility-scoped Employee
- Onboarding `facility` / not complete

## What Harbor does not create

- Stripe customer, subscription, or `FacilityBilling`
- Department Products, entitlements, Departments, or log presets
- Organization membership, ORG_ADMIN, or claim invitations

New Organizations may remain UNCLAIMED. Claim stays a separate Console workflow.

## Authority

`requireHarborOwner` only. MEMBER cannot see **New customer** and cannot call the action.

## Routes

- `/console/customers` → **New customer** (OWNER)
- `/console/customers/new` → **Provision Facility**
- Success → `/console/customers/[facilityId]`

No automatic work session.

## Identity

- New email: User with `passwordHash = null`, then existing `issueAndSendAccountInvite`
- Existing email: reuse User, grant FA, no invite
- Email failure after commit does not roll back the Facility

## Shared bootstrap

`src/lib/facility-provisioning` is the domain service. Public signup calls it for database facts and keeps password, verification, rate limits, and `PUBLIC_SIGNUP_ENABLED`.

Harbor does not call `POST /api/auth/signup` or CLI seed scripts. `scripts/bootstrap-pilot-facility-admin.mjs` remains a legacy operator tool and is not on the commercial path.

## Parent ownership

Confirmation states that the Facility will be owned by the selected Organization and that ownership cannot currently be reassigned.

## Replay

Exact existing-User replay (same Organization, same Facility name, incomplete setup, same current FA grant) reuses the Facility. A same-name sibling under the same Organization requires explicit confirmation. Facility names are not globally unique.

## Audit

`HarborAuditAction.PROVISION_FACILITY` is written after commit. Invite email also happens after commit; email failure does not roll back the Facility.

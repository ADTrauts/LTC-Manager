# Organization Claim Bootstrap — Phase 2B2

**Date:** 2026-10-07  
**Scope:** Harbor-approved first Organization Administrator claim workflow.  
**Does not include:** general member invitations (2B3), partner Facility user assignment (2C).

---

## Definitions

| Term | Meaning |
|------|---------|
| **Organization claim** | Trusted bootstrap establishing the **first** Organization Administrator for an external Organization. |
| **Claim requester** | Usually a Facility Administrator proposing a contact email. Grants **no** authority. |
| **Harbor approver** | `PlatformStaff` authorizing bootstrap. Does **not** receive Organization membership or Facility membership to do this. |
| **Claim recipient** | Exact email identity that receives first `ORG_ADMIN` only after secure acceptance. |

**Facility Administrator cannot grant Organization Administrator authority.**

**Organization Administrator authority grants zero Facility access.**

---

## Authorities

### Facility Administrator

May: see Unclaimed / Claim pending / Administrable for partner Orgs; submit a claim request for a partner Org; provide proposed contact email; inspect status of requests initiated from their Facility.

Must not: approve claims; create first ORG_ADMIN; revoke another Org’s established admin; manage Metz memberships.

Eligibility: active Organization + no current ORG_ADMIN + existing `FacilityPartnerOrganization` for `session.facilityId` that is **not ENDED**.

### Harbor PlatformStaff

May: review queue; approve; reject; revoke approved-but-unaccepted invitations; create a direct Harbor claim request when needed; inspect claim history.

Must not receive: `UserOrganizationMembership`, `PartnerUserFacilityAccess`, or Facility membership for this governance work.

### ORG_ADMIN (after acceptance)

Authority comes from `UserOrganizationRolePeriod`. General additional-member invitation is Phase 2B3.

---

## Derived Organization claim state

Do **not** persist `Organization.isClaimed`.

| Display | When |
|---------|------|
| `UNCLAIMED` | No current ORG_ADMIN and no live claim workflow |
| `CLAIM_PENDING` | No current ORG_ADMIN and a live REQUESTED or non-expired APPROVED claim |
| `ADMINISTRABLE` | At least one current ORG_ADMIN |

Historical rejected/revoked/expired claims alone → `UNCLAIMED` again. Independent of `Organization.isActive`.

---

## Claim model

`OrganizationClaimInvitation` with statuses:

`REQUESTED` → `APPROVED` | `REJECTED`  
`APPROVED` → `REVOKED` | `ACCEPTED` (or derived `EXPIRED`)

`EXPIRED` is **derived** when `status = APPROVED` and `expiresAt <= now` and not accepted/revoked.

REQUESTED has no bearer token. Harbor approval mints a secure token (hash stored; plaintext only for delivery). TTL: **7 days** (same as AccountInviteToken).

---

## Exclusivity / concurrency

- Multiple `REQUESTED` proposals may exist for Harbor review.
- At most one **claimable** (`APPROVED`, unexpired) invitation per Organization.
- Acceptance re-checks zero current ORG_ADMIN inside a Serializable transaction, then creates membership + ORG_ADMIN period, marks ACCEPTED, revokes competing APPROVED, rejects remaining REQUESTED.

---

## Acceptance

- Existing User: email must match; home Facility / Facility RoleKey unchanged.
- New User: organization-only (`facilityId = null`, `roleId = null`); password set; `emailVerifiedAt` set (same as account-invite acceptance).
- Session after accept: organization-scoped → `/organization/[organizationId]`.
- Claim token is dead after use; ongoing authority is membership + active Organization.

Inactive Organization → deny request, approve, and accept.

---

## Audit events

- `organization_claim.requested`
- `organization_claim.approved`
- `organization_claim.rejected`
- `organization_claim.revoked`
- `organization_claim.accepted`

Never include plaintext claim tokens.

---

## Operator / partner independence

Department operator relationships and Facility partner / department scope rows are **not** modified by claim request, approval, or acceptance. Operator status does not auto-create or auto-approve claims.

---

## Invitation delivery (closeout)

Sequence:

1. Harbor approve commits claim `APPROVED` + token hash + expiry (Serializable).
2. After commit, attempt email delivery (never holds the DB transaction open).
3. Persist Harbor-visible delivery fields: `lastInvitationDeliveredAt`, `lastInvitationDeliveryStatus` (`SENT` | `FAILED` | `NOT_CONFIGURED`), `lastInvitationDeliveryError`.

Delivery path: Postmark template alias `organization-claim` when available; otherwise transactional HTML/text fallback with organization name, expiry, and secure claim link only.

Failed delivery does **not** roll back approval. Harbor may **Resend**: rotate token hash + expiry (prior plaintext invalid), then attempt delivery again. Plaintext tokens are never stored.

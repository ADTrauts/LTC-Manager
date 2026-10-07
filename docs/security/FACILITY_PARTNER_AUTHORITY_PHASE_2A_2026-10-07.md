# Facility Partner Authority — Phase 2A

**Date:** 2026-10-07  
**Scope:** Facility ↔ external Organization partnership identity, timestamp access periods, and Department authorization scope.  
**Does not include:** partner users, Organization membership, claiming, facility switching, portfolio, or runtime access.

---

## Separated truths

| Concept | Meaning | Phase 2A grants user access? |
|---------|---------|------------------------------|
| Facility parent Organization | `Facility.organizationId` | N/A (internal path) |
| Department operating Organization | `DepartmentOperatorRelationship` | No |
| Facility partner Organization | `FacilityPartnerOrganization` | No |
| Partner Department scope | `FacilityPartnerDepartmentScope` | No |
| User authorization | Future Path B | Not implemented |

Never infer one from another. Operator relationships and partner scopes must not auto-sync.

---

## Temporal model (security)

Partner authorization uses UTC `DateTime` half-open intervals:

```text
startsAt <= instant < endsAt  (null endsAt = open)
```

This is distinct from Phase 1 operator `@db.Date` inclusive service-date semantics.

Derived partnership lifecycle (not a second persisted status):

- **ENDED** — `endedAt <= now`
- **ACTIVE** — an access period contains now
- **PENDING** — not ended; no period has started yet (includes future-only schedules)
- **SUSPENDED** — not ended; not active; at least one period has already started

---

## Authorization boundary

All Phase 2A mutations require `FACILITY_ADMINISTRATOR` on the session Facility. Cross-Facility partnership IDs fail closed.

`UserFacilityAccess` remains internal / same-parent-Organization only. Phase 2A does not alter:

- `canAccessFacility`
- `switchActiveFacility`
- JWT facility claims
- Employee PIN sessions

**Phase 2A grants zero external-user Facility access.**

---

## Phase 2C warning

Do not simply set a partner user's `User.facilityId` to the customer Facility as a fake “home.” Internal eligibility uses home Facility Organization. Path B partner authorization must resolve home/default vs active Facility before external users are enabled.

---

## Admin surface

`/admin/organization/partners` (+ detail). Domain logic: `src/lib/partner-access/`.

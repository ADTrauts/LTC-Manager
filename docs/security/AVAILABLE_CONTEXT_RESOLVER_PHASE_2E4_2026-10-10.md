# Available Context Resolver — Phase 2E4

**Date:** 2026-10-10  
**Scope:** Canonical read model of which workspaces an active User may enter right now.  
**Does not include:** account session, `enterContext`, My Access UI, global `/account`, 0/1/many login, context switcher, last-used context, schema, PIN, Employee, Harbor.

---

## Available Context

A current enterable workspace relationship belonging to a User. Discovery only. The list is not an authorization token. Later entry must revalidate the underlying relationship live.

## Context kinds

```text
organization:<organizationId>
facility_internal:<facilityId>
facility_partner:<facilityPartnerOrganizationId>
```

- **Organization** — current membership + current role period + Organization active.
- **Internal Facility** — current `UserFacilityAccess` + current `UserFacilityRolePeriod` + Facility exists + owning Organization active. Role comes from the period, never `User.roleId`. `User.facilityId` may mark `isHome` only.
- **Partner Facility** — live Path B via `listAuthorizedPartnerFacilitiesForUser`. Identity is the partnership id, not Facility id.

## Context discovery

Composed from canonical services:

```text
assertActiveUser
  ├── listCurrentOrganizationMembershipsForUser
  ├── listCurrentInternalFacilityRoles + Facility/owner-org batch
  └── listAuthorizedPartnerFacilitiesForUser → resolveFacilityAuthorization(accessKind: "partner")
        ↓
listAvailableContexts
        ↓
presentAvailableContexts
```

Unknown User → `USER_NOT_FOUND`. Inactive User → `USER_INACTIVE`. Active User with no relationships → `[]`.

## Not authority

`AvailableContext` never mints a session and is never sufficient to enter. A revoke between list and click must fail at entry (Phase 2E5).

## Not contexts

```text
Employee
PIN session
Harbor PlatformStaff
Department
owned Facilities / all client Facilities of an Organization
```

One partner relationship is one context even when several Departments are in scope. Department names are presentation only (`1–2` names, otherwise `N Departments`).

## Same Facility

Internal Terrace View and Terrace View via Metz are two contexts. Metz Organization and Terrace View via Metz are two contexts. No Facility dedupe. No role merge.

## Topology

`Facility.organizationId` and Organization client partnerships do not create personal contexts. Personal `UserFacilityAccess` / `PartnerUserFacilityAccess` still required.

## Inactive owner Organization

Internal contexts whose `Facility.organization.isActive` is false are excluded, consistent with Organization membership hiding inactive Organizations.

## Presentation

Persona RoleKey labels (Team Member, Lead Team Member). Organization: Administrator / Member. Partner: canonical `partnerRoleLabel`. Groups: Organizations, Internal Facilities, Client Facilities.

## Later work

- 2E5 — account session + neutral `enterContext`
- My Access UI
- 0/1/many login routing

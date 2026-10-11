# Organization Portfolio — Phase 3A

**Date:** 2026-10-11  
**Scope:** Read-only Organization Portfolio plus personal Open via `enterContext`.  
**Does not include:** Create Facility, Add Client, relationship detail, Members/Clients changes, cross-Facility Run reporting, billing, schema.

---

## Permanent distinction

```text
My Access              = contexts the current User may personally enter
Organization Portfolio = Facilities and operating relationships visible to the current Organization
Portfolio visibility  ≠ Facility authority
```

`/organization/<id>` is Portfolio. It requires an Organization session whose `organizationId` matches the URL.

Both `ORG_ADMIN` and `ORG_MEMBER` view the same read-only Portfolio. Members and Clients stay ORG_ADMIN governance.

## Sources

| Row | Source | Personal Open |
|---|---|---|
| Owned | `Facility.organizationId` | matching `facility_internal:<facilityId>` from one `listAvailableContexts` call |
| Client | current ACTIVE `FacilityPartnerOrganization` | matching `facility_partner:<fpoId>` |

`DepartmentOperatorRelationship` enriches client Operating names only. It does not create client rows. Partner Department scope is not Operating.

Open posts only `contextKey` to `enterContextAction`. Pagination may be added if a real Organization scale makes it necessary.

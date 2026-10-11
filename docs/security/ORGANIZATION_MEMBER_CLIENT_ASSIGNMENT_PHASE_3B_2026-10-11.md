# Organization Member Client Assignment — Phase 3B

**Date:** 2026-10-11  
**Scope:** Person-first client assignment from Organization Members.  
**Does not include:** new Organization tab, dedicated member route, batch assign, Portfolio coverage, Create Facility, Add Client, My Access redesign, schema.

---

## Permanent distinctions

```text
Organization membership
= affiliation with an Organization

Client assignment
= Organization-governed partner Facility access when Facility delegation permits it

My Access
= contexts the User may personally enter

Organization member
≠ client Facility assignment
```

```text
Portfolio visibility
≠ personal Facility authority
```

`DepartmentOperatorRelationship` is operating responsibility. It is not assignment authority.

---

## Surfaces

| Surface | Job |
| --- | --- |
| Portfolio | Where the Organization operates |
| Clients | Facility-first staffing and relationship lifecycle |
| Members | Organization membership governance, plus person-first client assignment |

ORG_ADMIN in an Organization session opens **Manage client assignments** on a current member. The row expands. Detail loads only for that member.

ORG_MEMBER still cannot open Members and cannot mutate staffing.

---

## Services

Reads: `listOrganizationMemberClientAssignments`

Writes reuse Clients:

```text
assignOrganizationClientMember → assignPartnerUser
changeOrganizationClientMemberRole → changePartnerUserRole
endOrganizationClientMemberAccess → endPartnerUserAssignment
```

The read model classifies presentation. The write services remain authoritative.

---

## Assignable clients

Current `FacilityPartnerOrganization` rows for the Organization. Owned Facilities are excluded. ENDED relationships are omitted.

Assignable only when the partnership is ACTIVE, staffing is delegated, a role ceiling exists, Department scope is non-empty, the target is a current active Organization member, and the member is not restricted and not already assigned.

---

## My Access

Assignment and end do not mint or kill sessions. Path B / `listAvailableContexts` pick up the current assignment on the next live authorization.

# HFN Post-Identity Integration Certification

**Date:** 2026-10-11  
**Scope:** Identity-integration only. Not a new HFN product-completeness audit.  
**Does not include:** Logs, Assets, Review, Build, Operational Cycles, partner HFN, meal readiness, Department Builder, PIN, or schema.

---

## Permanent rule

```text
HFN consumes authorized Facility/Department context.
Global User home metadata does not define current HFN authority.
Internal and partner hats remain separate.
```

| Question | Source |
| --- | --- |
| Current Facility | validated Facility session (`session.facilityId`) |
| Current internal role | live `UserFacilityRolePeriod` → `session.role` |
| Current Department | active Department cookie / resolver, validated at the session Facility |
| Partner authority | Path B, not this helper |
| PIN authority | Employee plane, unchanged |

`User.facilityId`, `User.roleId`, and `User.primaryDepartmentId` are home/compatibility fields. They are not active HFN workspace authority.

## Finding and fix

The only identity-integration defect was Facility Administrator Dietary assignment management. It required:

```text
User.facilityId === session.facilityId
AND
User.primaryDepartmentId === departmentId
```

That denied a valid FA who entered a non-home Facility through My Access, Organization Portfolio, or `enterContext`.

Current rule, preserved:

```text
FA role here comes from the current Facility session.
The Dietary relationship is the current Facility's HFN Department (`key === "DIETARY"`).
```

A non-home FA at Facility B may manage Dietary assignments at Department B. Home FA behavior is unchanged. Manager/Supervisor policy is unchanged. Partner and PIN stay on their own planes.

## Certification

HFN remains sealed under the global User/context architecture. No further HFN architecture audit is required for this identity boundary.

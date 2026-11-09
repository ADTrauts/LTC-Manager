# Phase 2C Release R1 — CDA write-manifest qualification action correction

**Date:** November 8, 2026  
**Verdict:** **PASS**  
**Nature:** Register the previously unlisted Employee operational-qualification write in the central CDA write manifest. No runtime permission change. No deploy. No schema change.

---

## 1. SHAs

| | |
|---|---|
| Starting HEAD | `b77042a164841efdc0933d315430d5a1725fd16b` (Phase 2C final cert docs) |
| Ending HEAD | Working tree on `b77042a` (commit when verified) |

Implementation checkpoint remains `0d706e6`. This R1 is an independent authorization housekeeping commit.

---

## 2. Original failing action and test

| | |
|---|---|
| File | `src/app/(protected)/employees/qualification-actions.ts` |
| Export | `setEmployeeOperationalQualificationsAction` |
| Failure | `write manifest (enforce mode)` — unlisted write under `WRITE_MANIFEST_MODE === "enforce"` |
| Suite | `src/lib/department-authority/write-manifest.hermetic.test.ts` |

---

## 3. Existing authorization checks (unchanged)

1. `requireFacilitySession()` — facility session required  
2. `requirePasswordSession(session)` — Quick PIN / shared tablet cannot call  
3. `requireAtLeastRole(session.role, "MANAGER")` — Manager+  
4. `assertCanChangeDepartmentPeople(prisma, session, departmentId)` — Department people-change authority (head or allowed staff manager)  
5. `replaceEmployeeOperationalQualifications` — facility-scoped Employee + Department membership validation before write  

Manifest recognition does **not** grant access; runtime gates remain authoritative.

---

## 4. Selected manifest classification

```ts
[`${PROTECTED}/employees/qualification-actions.ts`]: {
  setEmployeeOperationalQualificationsAction: department("workforceRecord"),
}
```

Equivalent: **class `DEPARTMENT`, owner `workforceRecord`.**

---

## 5. Why that classification is correct

- The write replaces operational eligibility rows on an **Employee** for one Department (`EmployeeOperationalRoleQualification`).
- Neighboring Employee Builder people writes (`updateEmployeeProfileAction`, PIN, status, separation, default assignment, discipline) are already `department("workforceRecord")`.
- Runtime people gate is the same family as those writes: `assertCanChangeDepartmentPeople` (qualification uses the form `departmentId`; profile uses primary Department).
- Owner resolver `workforceRecord` resolves the Employee’s facility membership Departments — appropriate for workforce-record mutations.
- Not `GOVERNANCE` (facility-admin session revoke pattern).
- Not bare `department("department")` catalog install pattern — this is Employee workforce eligibility, not Department product install.
- No new authority category introduced.

---

## 6. Exact files changed

| Path | Change |
|---|---|
| `src/lib/department-authority/write-manifest.ts` | Register qualification action |
| `src/lib/department-authority/write-manifest.hermetic.test.ts` | Focused R1 registration + runtime-gate source assertions |
| This report | Docs |
| ARR register | CDA/qualification coverage note |

---

## 7. Authorization invariants

- Manager + password session still required.  
- Department people-change authority still required.  
- Facility isolation via `session.facilityId` in replace service still required.  
- Cross-Department edit still blocked when `assertCanChangeDepartmentPeople` fails.  
- Manifest entry alone cannot authorize a caller.

---

## 8. Test results

| Suite | Pass | Fail | Skip |
|---|---:|---:|---:|
| `write-manifest.hermetic.test.ts` (incl. enforce + R1) | 3 | 0 | 0 |
| All `department-authority/*.hermetic.test.ts` + 2A/2B + 2H-1/2H-3 focused | 99 | 0 | 0 |
| `eligibility.hermetic.test.ts` | 10 | **3** | 0 |

Eligibility failures are **pre-existing** (ARR-008 Job Role / registry dual-model assertions) and were not introduced by this manifest registration. R1 does not change qualification runtime semantics.

Live authorized/unauthorized HTTP exercise: **not run** (hermetic only).

---

## 9. Enforce failure resolved?

**Yes.** `setEmployeeOperationalQualificationsAction` is classified; enforce-mode unlisted list is empty for this action.

---

## 10. Remaining security / authorization gaps

- Live browser authorization probes still outstanding (Phase 2C CONDITIONAL release gate).  
- ARR-008 Department Job Role vs operational qualifications dual model remains architectural debt (unchanged by R1); three eligibility hermetics still fail on that debt.  
- ARR-021 CDA env default flag unchanged.  
- No other unlisted writes discovered in this R1 run.

**Recommended next release-certification action:** Re-run Phase 2C release checklist with R1 included; proceed to browser/offline smoke when a safe session environment is available.

**STOP.**

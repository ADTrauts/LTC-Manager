# Facility Plant Operations — Phase 3C Certification

**Date:** 2026-10-05  
**Mode:** ACT complete — corrective-maintenance operating workflow  
**Classification:** SUPPORTING  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Plan:** [Phase 3 Plan 2026-10-05](./FACILITY_PLANT_OPERATIONS_PHASE_3_PLAN_2026-10-05.md)  
**Phase 3A:** [Phase 3A certification 2026-10-05](./FACILITY_PLANT_OPERATIONS_PHASE_3A_CERTIFICATION_2026-10-05.md)  
**Phase 3B:** [Phase 3B certification 2026-10-05](./FACILITY_PLANT_OPERATIONS_PHASE_3B_CERTIFICATION_2026-10-05.md)

Facility Plant Operations remains **DEVELOPMENT**. This phase did not implement 3D closeout/cost/required Records, PM, billing, or registry AVAILABLE.

---

## Verdict

```text
PASS WITH GAPS
```

The corrective operating loop is implemented and SQL-certified:

```text
Request → Plant triage → Issue → Work Order → assign/start/hold/resume/complete
        → explicit Issue resolve / Asset condition / Request outcome
```

Work Order completion still does not resolve Issue, close Request, or restore Asset. Those remain separate supervisor actions.

The gap is interactive Harbor browser execution of the new UX against a live authenticated session. Domain, orchestration, and SQL scenarios 1–8 passed.

---

## Persistence / Product nouns

```text
OperationalRequest  = Request
AssetIssue          = Issue
Repair              = Work Order
```

No new history ledger tables. No `WorkOrder` / `Issue` Prisma models.

---

## Chosen Request-resolution behavior

Resolving an Issue may optionally resolve its linked open Requests in the **same supervisor action**, as separate auditable writes.

```text
Resolve Issue
☐ Resolve linked open Requests
```

- UX checkbox default: **unchecked**
- Service default: `resolveLinkedRequests = false`
- Work Order completion never touches Request authority

Documented so callers do not assume silent Request closeout.

---

## Record-origin decision

**Implemented.**

`AssetIssue.originEvidenceRecordId?` → `OperationalEvidenceRecord` (`AssetIssueOriginEvidence`).

`createIssueFromRecord()`:

1. loads the canonical Record;
2. snapshots stored Facility / Location (and optional Asset);
3. creates Issue with origin Record;
4. does **not** create a Work Order unless the caller explicitly asks.

UI entry point: Record-ID form on `/asset-issues` (Create Issue from Record). No automatic failed-Record escalation. No large Record UX rewrite.

If the Asset later moves, origin Location stays the Record’s stored Location (`allowUnitScopeOverride`).

---

## Triage

Surface: `/staffing/operations` Plant triage panel. Product copy uses Request / Issue / Work Order. Requester-visible status is the Phase 2 projection, not raw stored Request execution statuses.

| Action | Result |
|--------|--------|
| Accept + create Issue | Request `UNDER_REVIEW` (authority ACCEPTED) + new Issue. No Work Order. |
| Accept + Issue + Work Order | One transaction: accept + Issue + first corrective WO. Three records. |
| Link existing Issue | Duplicate Request joins the existing Issue. No second Issue. |
| Decline | Request `CANCELLED` + required reason (≥3 chars). No Issue. No WO. |
| Resolve without work | Existing resolve-without-WO path. No fake Issue. |

Issue lookup is explicit search of open Issues (Location / Asset / text). No fuzzy/AI matching.

---

## Issue operations

Route remains `/asset-issues`. Product heading is **Issues**.

List views: Open / Monitoring / Resolved / Canceled. Filters: Location, text. Rows show title, Location, optional Asset, status, created, Work Order count, linked Request count, age. Persistence name `AssetIssue` is not shown.

Detail is the problem workspace: condition, origin Record if present, linked Requests, linked Work Orders (status / technician / priority / category), source-fact history, and supervisor actions (create WO, resolve with optional Request closeout, reopen, monitor).

MONITORING remains a condition state — not assigned / in progress / on hold.

Direct Issue create (no Request) is supported on the list page. Location required; Asset optional.

---

## Work Order manager

Route remains `/repairs`. Product heading is **Work Orders**. Maintenance sub-tab stays **Repairs** per platform nav contract.

Filters: Emergency/Urgent, Unassigned, Assigned, In Progress, On Hold, completed, My work. Canonical priority / status / hold reason / category — not raw `RepairStatus` / `RepairPriority` / `RepairTrade` as Product truth.

Supervisor+ may create a direct Work Order without Request or Issue. Creating from Issue snapshots Issue Location, keeps corrective kind, and does not change Issue status.

---

## Technician execution

Plant STAFF use the same `/repairs` route, defaulting to **My Work**.

Assigned technician may start, hold (with Phase 3B `holdReason`), resume, add an update/note (`RepairUpdate`), associate incidental Records (`RepairEvidenceLink`), and complete.

Supervisor+ owns assign / reassign / unassign, priority, category, triage, and Issue resolve. One `assignedEmployeeId` remains MVP.

Start / hold / resume / complete do not mutate Request authority, Issue status, or Asset condition. Requester projection may independently show `IN_PROGRESS` from linked open Work Orders.

---

## Recovery

After completion the Work Order detail surfaces:

```text
Work Order completed.
Issue: Still OPEN | Resolved | None
Asset: current condition | Location-only (no Asset)
[Resolve Issue] [Update Asset condition] [Create another Work Order]
```

Simple success is sequential explicit actions: complete WO → resolve Issue (optional linked Requests) → return Asset to service.

Partial repair is natural: WO #1 complete, Issue stays OPEN, create WO #2.

Location-only work never invents an Asset or Asset-condition step.

---

## Requester projection

`presentRequesterStatus` may consume the Request’s first `workOrderId` **and** Issue-linked Work Order statuses.

```text
RECEIVED | ACCEPTED | IN_PROGRESS | RESOLVED | DECLINED
```

`IN_PROGRESS` is derived. ASSIGNED / ON_HOLD / WAITING_ON_VENDOR are never written onto Request authority.

---

## History

No `IssueHistory` / `WorkOrderHistory` / `PlantHistory` tables.

Asset History and Location History continue to project source facts (Issue, Work Order, Request, condition). Post-3B Work Orders keep stored `unitId` / `spaceId`. Asset moves do not rewrite historical rows. Procedure pin stays on the Work Order version.

---

## Routes / UI

| Route | Product |
|-------|---------|
| `/staffing/operations` | Plant Request triage + exception counts |
| `/asset-issues` | Issues list / create / Record-origin |
| `/asset-issues/[issueId]` | Issue workspace |
| `/repairs` | Work Orders / My Work |
| `/repairs/[id]` | Work Order detail + execution + recovery |

RUN top nav stays one **Maintenance** item. Issues stay reachable by URL and from triage / Work Order / Issue links. Official Product name remains Facility Plant Operations.

---

## Schema / migration

**Filename:** `prisma/migrations/20261005230000_issue_origin_evidence_record/migration.sql`

Additive `AssetIssue.originEvidenceRecordId` nullable FK + index. No historical rewrite. No fabricated origin Records. Applied as migration 117 on disposable `ltc_verify_phase3c_plant_20261005`. Source `ltc_manager` was never targeted.

---

## Tests

Disposable SQL: `scripts/verify/admin-database.mjs` → `ltc_verify_phase3c_plant_20261005`.

| Suite | Result |
|-------|--------|
| Phase 3C corrective SQL (2) | PASS — scenarios 1–8 plus decline / resolve-without-work |
| Targeted hermetic (61) | PASS |
| Phase 3A (2) | PASS |
| Phase 3B (2) | PASS |
| Phase 10A (4) | PASS after Dietary servery fixtures on the disposable DB |
| Phase 12A Request (2) | PASS |
| Phase 12A Plant (2) | PASS |
| Location History (1) | PASS |
| Knowledge versions (1) | PASS |
| Department Product / eligibility | PASS — PLANT DEVELOPMENT |

```text
pnpm exec prisma validate     PASS
pnpm typecheck                PASS
targeted eslint               PASS (unused import removed)
pnpm lint                     FAIL — 9 errors, 45 warnings — PRE-EXISTING
pnpm verify:migrations        PASS after staging — 117 migrations
                              newest 20261005230000_issue_origin_evidence_record
```

Browser: local `/repairs` redirects to `/login`. Seeded Terrace View demo sign-in did not establish a session in this pass (live password likely diverged, and DEVELOPMENT Plant still requires Harbor/internal access). Interactive supervisor/technician click-through was **not** completed. SQL + hermetic remain the certification of the workflow. Visibility rules were not weakened.

---

## Invariants

```text
Request ≠ Issue ≠ Work Order ≠ Shared Work

WO COMPLETED ≠ Issue RESOLVED
WO COMPLETED ≠ Request RESOLVED
WO COMPLETED ≠ Asset OPERATIONAL
```

---

## Product governance

`getDepartmentProduct("PLANT")?.status === "DEVELOPMENT"`. Not Marketplace-visible, not sellable, not customer-installable. No billing/entitlement changes.

---

## Deferred

### Browser click-through

Harbor-authenticated supervisor + technician execution on a DEVELOPMENT-gated local session.

### 3D

Labor duration capture, parts lines, part cost, Vendor cost, required Record gates, formal Work Order closeout checklist.

Still no PM implementation. Still not AVAILABLE.

---

## Phase 3D readiness

```text
READY FOR PHASE 3D
```

Corrective Request → Issue → Work Order → execution → explicit recovery is operationally coherent. Closeout/evidence/cost can now attach to real completed work without inventing the operating loop.

This certification does not declare READY FOR PM as a 3C deliverable. The Phase 3 plan already treats 3D as later MVP and not a PM-architecture blocker.

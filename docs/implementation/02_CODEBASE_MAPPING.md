# Codebase Mapping

**Status:** Implementation map — per-wave affected artifacts  
**Date:** 2026-07-07  
**Application root:** `ltc-manager/`

This document maps each modernization wave to **existing features**, **files**, **routes**, **models**, and **services** in the current codebase. Use it when scoping a wave prompt and when estimating blast radius.

Paths are relative to `ltc-manager/` unless noted.

---

## Shared infrastructure (all waves)

These artifacts are touched lightly in most waves:

| Artifact | Path | Role |
|----------|------|------|
| Request guard | `src/proxy.ts` | Auth, onboarding, RBAC, department allowlist |
| Protected layout | `src/app/(protected)/layout.tsx` | Wraps AppShell |
| App shell | `src/components/app-shell.tsx` | Main chrome |
| Route permissions | `src/lib/route-permissions.ts` | Role × route matrix |
| Access helpers | `src/lib/access.ts` | Role hierarchy |
| Department nav | `src/lib/department-nav.ts` | DIETARY/EVS/PLANT allowlists |
| Department scope | `src/lib/department-scope.ts`, `src/lib/active-department-context.ts` | Cookie + context |
| Facility context | `src/lib/facility-context.ts` | Tenancy |
| Session employee | `src/lib/session-employee.ts` | PIN vs email session |
| Prisma client | `src/lib/prisma.ts` | DB access |
| Route seed | `prisma/seed.mjs` | `AppRoute`, permissions |
| Schema | `prisma/schema.prisma` | All models |

---

## Wave 1 — Application Shell & Navigation

### Existing features affected

| Feature | Maturity | Current behavior |
|---------|----------|------------------|
| Top nav (module list) | Production-ready | DB-driven from `AppRoute` |
| Left sidebar (locations) | Production-ready | Unit list via `getSidebarUnitsForSession` |
| Department scope switcher | Production-ready | Cookie `ltc_active_department` |
| Kiosk unit lock | Production-ready | Device cookie + banner |
| Role-based route access | Production-ready | Proxy + `RoleRoutePermission` |

### Components

| File | Change type |
|------|-------------|
| `src/components/app-shell.tsx` | **Major** — zone model, layout regions |
| `src/components/top-nav.tsx` | **Major** — zone tabs vs module links |
| `src/components/left-sidebar.tsx` | **Major** — Locations rail, readiness placeholder |
| `src/components/department-scope-switcher.tsx` | **Moderate** — mode lens labeling |
| `src/components/kiosk-unit-access-banner.tsx` | **Minor** — copy/zone context |
| `src/components/module-placeholder.tsx` | **Reference** — pattern for new zones |

### Routes / pages

| Route | File | Notes |
|-------|------|-------|
| `/dashboard` | `src/app/(protected)/dashboard/page.tsx` | Maps to Operations Center zone |
| `/unit/[unitId]` | `src/app/(protected)/unit/[unitId]/page.tsx` | Unit Workspace zone |
| `/reports` | `src/app/(protected)/reports/page.tsx` | Review zone |
| `/admin/*` | `src/app/(protected)/admin/**` | Administration zone |
| All protected routes | `src/app/(protected)/**` | Nav visibility |

### Database models

| Model | Change |
|-------|--------|
| `AppRoute` | Label/order updates; possible new route keys |
| `RoleRoutePermission` | Permissions for new `/today` route (prep for Wave 4) |

### Services / lib

| File | Change |
|------|--------|
| `src/lib/route-permissions.ts` | Zone grouping, default home by role |
| `src/lib/department-nav.ts` | Mode-filtered nav sets |
| `src/lib/units.ts` | Sidebar units — readiness hook prep |
| `src/hooks/use-nav-pathname.ts` | Active zone detection |
| `src/proxy.ts` | Allowlist for new paths |

### API routes

| Route | File |
|-------|------|
| `/api/auth/active-department` | `src/app/api/auth/active-department/route.ts` |
| `/api/auth/session` | `src/app/api/auth/session/route.ts` |

---

## Wave 2 — Operations Center

### Existing features affected

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Global dashboard | Production-ready | Compliance, repairs, staffing, servery, birthdays |
| Servery meal status | Production-ready | Dashboard cards |
| Log compliance summary | Production-ready | Dashboard section |
| Staffing coverage summary | Production-ready | Dashboard section |
| Post-onboarding checklist | Partial | New facility banner |

### Components

| File | Change |
|------|--------|
| `src/app/(protected)/dashboard/page.tsx` | **Major** — card order, operation header, site pulse |
| `src/components/servery-meal-service-controls.tsx` | **Minor** — shared meal period display |

### Routes

| Route | File |
|-------|------|
| `/dashboard` | Primary surface (Operations Center) |
| Optional alias `/operations` | **New** — redirect or duplicate entry |

### Database models (read-only in v0)

| Model | Use |
|-------|-----|
| `ServeryMealServiceEvent` | Meal ready/started grid |
| `LogAssignment`, `LogSubmission` | Compliance cards |
| `Repair` | Open issues count |
| `ScheduleEntry`, `AssignmentOverride` | Staffing gaps |
| `Unit`, `UnitMealTime` | Location count, meal times |

### Services / lib

| File | Change |
|------|--------|
| `src/lib/servery-meal-service.ts` | Active meal period helper |
| `src/lib/menu-db.ts`, `src/lib/menu-cycle.ts` | Today's menu context (optional card) |
| **New** `src/lib/operations-center/` | Card data aggregators |

### Related pages (drill-down targets)

| Route | File |
|-------|------|
| `/staffing` | `src/app/(protected)/staffing/page.tsx` |
| `/logs` | `src/app/(protected)/logs/page.tsx` |
| `/repairs` | `src/app/(protected)/repairs/page.tsx` |
| `/unit/[unitId]` | `src/app/(protected)/unit/[unitId]/page.tsx` |

---

## Wave 3 — Unit Workspace

### Existing features affected

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Unit dashboard | Production-ready | Menu, logs, servery |
| Log submit from unit | Production-ready | Assignments + submit |
| Servery controls | Production-ready | Meal ready/started |
| Operational issues section | Partial | Open repairs summary |

### Components

| File | Change |
|------|--------|
| `src/app/(protected)/unit/[unitId]/page.tsx` | **Major** — layout, work queue |
| `src/components/servery-meal-service-controls.tsx` | **Moderate** — prominence |
| `src/components/logs/logs-tabs-client.tsx` | **Moderate** — embedded submit |

### Routes

| Route | File |
|-------|------|
| `/unit/[unitId]` | Primary workspace |

### Database models

| Model | Use |
|-------|-----|
| `Unit`, `UnitMealTime` | Context |
| `LogAssignment`, `LogSubmission` | Due/completed work |
| `ServeryMealServiceEvent` | Service state |
| `Repair` | Open issues at unit |
| `ScheduleEntry` | Who is scheduled |
| `MenuItem`, `MenuSettings` | Today's menu |

### Services / actions

| File | Change |
|------|--------|
| `src/app/(protected)/unit/[unitId]/actions.ts` | Quick issue action prep (Wave 8) |
| `src/lib/servery-meal-service.ts` | Workspace header |
| `src/lib/menu-db.ts` | Menu display |
| `src/lib/units.ts` | Unit metadata |

### API routes

| Route | File |
|-------|------|
| `/api/auth/active-unit` | `src/app/api/auth/active-unit/route.ts` |
| `/api/auth/pin-login` | `src/app/api/auth/pin-login/route.ts` |

---

## Wave 4 — Supervisor & Today's Work

### Existing features affected

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Staffing grid | Production-ready | Coverage view |
| Assignment overrides | Production-ready | Day-of changes |
| Unit list + dashboards | Production-ready | Walk sources |
| Supervisor role tier | Production-ready | `RoleKey.SUPERVISOR` |

### Components (new + existing)

| File | Change |
|------|--------|
| **New** `src/app/(protected)/today/page.tsx` | Today's Work hub |
| **New** `src/app/(protected)/today/walk/page.tsx` | Walk list (SCR-03) |
| **New** `src/app/(protected)/today/coverage/page.tsx` | Coverage (SCR-04) |
| **New** `src/app/(protected)/today/handoffs/page.tsx` | Handoffs (SCR-05) |
| `src/app/(protected)/staffing/page.tsx` | Linked from coverage |
| `src/components/staffing-toolbar.tsx` | Deep-link params |

### Routes

| Route | Status |
|-------|--------|
| `/today` | **New** |
| `/today/walk`, `/today/coverage`, `/today/handoffs` | **New** |
| `/staffing` | Existing — linked |

### Database models

| Model | Use |
|-------|-----|
| `Unit` | Walk list rows |
| `ScheduleEntry`, `AssignmentOverride` | Coverage, call-downs |
| `Employee`, `EmployeeUnitAccess` | Assignee options |
| `Repair`, `LogSubmission` | Handoff signals |

### Services / lib

| File | Change |
|------|--------|
| `src/lib/scheduling-eligibility.ts` | Coverage validation |
| `src/app/(protected)/staffing/actions.ts` | Override create from call-down |
| **New** `src/lib/todays-work/` | Walk ordering, open call-downs |

### Seed / permissions

| File | Change |
|------|--------|
| `prisma/seed.mjs` | Add `today` route, supervisor+ permissions |

---

## Wave 5 — Operations Engine

### Existing features affected

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Meal period (implicit) | Production-ready | `MealType`, servery |
| Department mode | Production-ready | Department cookie |
| Menu cycle by week/day | Production-ready | `MenuSettings` |
| Work shifts | Partial | `WorkShift` model |

### Schema (new)

| Model | Purpose |
|-------|---------|
| `OperationDefinition` | Template: department + meal type + label |
| `OperationInstance` | Date-bound operation occurrence |

### Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | **New models** |
| `prisma/migrations/*` | **New migration** |
| **New** `src/lib/operations/` | Active operation resolver |
| `src/app/(protected)/dashboard/page.tsx` | Header from OperationInstance |
| `src/app/(protected)/unit/[unitId]/page.tsx` | Operation context |
| `src/lib/servery-meal-service.ts` | Link events to instance |
| `src/app/(protected)/logs/actions.ts` | Filter by operation |
| `src/app/(protected)/staffing/actions.ts` | Operation-scoped schedule |

### Database models (existing links)

| Model | Link |
|-------|------|
| `MealType` enum | Operation definition |
| `Department` | Operation scope |
| `ServeryMealServiceEvent` | Execution signal |
| `LogAssignment.mealType` | Compliance scope |

---

## Wave 6 — Readiness Engine

### Existing features affected

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Log pass/fail/missed | Production-ready | `LogSubmissionStatus` |
| Open repairs | Production-ready | `RepairStatus` |
| Staffing grid | Production-ready | Zero-staff detection |
| Servery ready/started | Production-ready | Events |
| EVS room status | Production-ready | `RoomAreaStatus` (EVS readiness signal) |

### Components

| File | Change |
|------|--------|
| `src/components/left-sidebar.tsx` | Readiness chips on rail |
| `src/app/(protected)/dashboard/page.tsx` | Site pulse, blocked units |
| `src/app/(protected)/unit/[unitId]/page.tsx` | Location readiness |
| **New** `src/components/readiness-chip.tsx` | Shared UI |

### Services (new)

| File | Purpose |
|------|---------|
| **New** `src/lib/readiness/compute-readiness.ts` | Composite rules |
| **New** `src/lib/readiness/blocked-rules.ts` | Configurable thresholds |
| **New** `src/lib/readiness/types.ts` | Complete / In progress / Blocked |

### Database models

| Model | Wave 6 v0 | Wave 6 v1 |
|-------|-----------|-----------|
| `LogSubmission` | Read | Read |
| `Repair` | Read | Read |
| `ScheduleEntry` | Read | Read |
| `ServeryMealServiceEvent` | Read | Read |
| `ReadinessSnapshot` | — | **Optional new** |

### Background jobs

| Artifact | Change |
|----------|--------|
| **New** `scripts/missed-log-detection.mjs` or worker | MISSED status automation |

---

## Wave 7 — Work Engine

### Existing features affected

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Log pipeline | Production-ready | Template → submission |
| Repairs | Production-ready | Work orders |
| Inspection frequency | Stub | `UnitDepartmentResponsibility.inspectionFrequency` |
| PM schedules | Partial | `PreventiveMaintenanceSchedule` |

### Schema (new)

| Model | Purpose |
|-------|---------|
| `Task` | Unified work item |
| `TaskType` enum | LOG, REPAIR, INSPECTION, COVERAGE, AD_HOC |
| `Inspection` / `InspectionSubmission` | **New** — inspection workflow |

### Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Task + inspection models |
| `src/app/(protected)/logs/actions.ts` | Emit/sync Task |
| `src/app/(protected)/logs/page.tsx` | Optional task ID display |
| `src/app/(protected)/repairs/actions.ts` | Emit/sync Task |
| `src/app/(protected)/repairs/page.tsx` | Backed by Task adapter |
| `src/components/units-manager.tsx` | Inspection cadence → assignments |
| **New** `src/lib/work/` | Task adapters, inbox queries |
| **New** `src/lib/work/adapters/log-task.ts` | LogSubmission ↔ Task |
| **New** `src/lib/work/adapters/repair-task.ts` | Repair ↔ Task |

### Database models (preserved)

| Model | Role |
|-------|------|
| `LogTemplate` → `LogSubmission` | Compliance engine (ADL-007) |
| `Repair`, `RepairUpdate` | Maintenance records |
| `AssignmentOverride` | Proto task for coverage |

---

## Wave 8 — Issue & Recovery

### Existing features affected

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Corrective repairs | Production-ready | `/repairs` |
| EVS quick ticket | Production-ready | `evs/actions.ts` |
| Repair routing | Production-ready | `repair-routing.ts` |
| Attachments | Partial | `attachments.ts` |
| PM schedules | Partial | Repairs page |

### Components / pages

| File | Change |
|------|--------|
| `src/app/(protected)/repairs/page.tsx` | Issue types, supply filter |
| `src/app/(protected)/repairs/actions.ts` | Supply short create |
| `src/app/(protected)/evs/page.tsx` | Issue type on ticket |
| `src/app/(protected)/evs/actions.ts` | `createEvsRepairTicketAction` |
| `src/app/(protected)/unit/[unitId]/page.tsx` | Quick issue form |
| `src/app/(protected)/dashboard/page.tsx` | Issue board card |
| **New** `src/app/(protected)/issues/[issueId]/page.tsx` | SCR-06 detail |

### Schema

| Model | Change |
|-------|--------|
| `Repair` | Add `issueType` enum or parallel `Issue` table |
| `WorkOrderKind` | Extend for SUPPLY_SHORT, SAFETY, etc. |

### Services

| File | Change |
|------|--------|
| `src/lib/repair-routing.ts` | Route by issue type |
| `src/lib/attachments.ts` | Issue attachments UI |
| `src/lib/readiness/blocked-rules.ts` | HIGH/URGENT issue blocks |

---

## Wave 9 — Knowledge Layer

### Existing features affected

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Union handbook PDF | Production-ready | `Facility.unionHandbookPdfPath` |
| Log template instructions | Partial | Text fields only |
| Template builder | Production-ready | `LogTemplate` |

### Schema (new)

| Model | Purpose |
|-------|---------|
| `KnowledgeArticle` | SOP, link, PDF ref |
| `KnowledgeAttachment` | Files |
| Join tables to `LogTemplate`, `Unit`, `Asset` | Point-of-work context |

### Files

| File | Change |
|------|--------|
| `src/app/(protected)/admin/organization/union-handbook-settings.tsx` | Knowledge index entry |
| `src/app/api/facility/union-handbook/route.ts` | Unchanged stream |
| `src/lib/facility-uploads.ts` | Storage abstraction prep |
| `src/app/(protected)/logs/page.tsx` | Template instructions |
| `src/app/(protected)/unit/[unitId]/page.tsx` | Contextual help drawer |
| **New** `src/app/(protected)/knowledge/page.tsx` | Site library (manager) |
| **New** `src/lib/knowledge/` | CRUD, search |

---

## Wave 10 — Operational AI

### Existing features affected

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Telemetry | Prototype | `src/lib/telemetry.ts` |
| Dashboard aggregations | Production-ready | Wave 2+6 outputs |

### Files (new)

| File | Purpose |
|------|---------|
| **New** `src/lib/ai/` | Provider client, prompts |
| **New** `src/lib/ai/morning-brief.ts` | SCR-01 brief |
| **New** `src/lib/ai/exception-summary.ts` | Card summarization |
| **New** `src/app/api/ai/brief/route.ts` | Optional API |
| `src/app/(protected)/dashboard/page.tsx` | Brief card UI |
| `src/lib/telemetry.ts` | AI event logging |

### Environment

| Variable | Purpose |
|----------|---------|
| `AI_PROVIDER`, `AI_API_KEY` | Feature-gated |

No Prisma models required initially; optional `AiAuditLog` later.

---

## Wave 11 — Organization & Multi-site Foundation

### Existing features affected

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Facility tenancy | Production-ready | All models `facilityId` |
| Management company name | Partial | String on Facility |
| Onboarding | Production-ready | Single-facility wizard |
| Stripe billing | Production-ready | Per-facility customer |

### Schema (new)

| Model | Purpose |
|-------|---------|
| `Organization` | Top-level tenant |
| `OrganizationMembership` | User ↔ org roles |
| `Facility.organizationId` | FK migration |

### Files (major touch)

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Org models |
| `src/lib/facility-context.ts` | Org + site context |
| `src/lib/auth.ts` | JWT claims |
| `src/proxy.ts` | Site switcher validation |
| `src/components/app-shell.tsx` | Site switcher UI |
| `src/app/setup/page.tsx` | Org creation path |
| `src/lib/onboarding.ts` | Org-aware onboarding |
| `src/lib/stripe.ts` | Org billing (if scoped) |
| **All** `src/app/(protected)/**/actions.ts` | Verify facility scope |
| `scripts/provision-facility.mjs` | Org provisioning |

### Database models (all facility-scoped)

Every model with `facilityId` in `prisma/schema.prisma` — **read for leak testing**, not all migrated in one PR.

---

## Wave 12 — Industry Configuration Layer

### Existing features affected

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Default departments | Production-ready | `ensure-default-departments.ts` |
| Unit types | Production-ready | `UnitType` enum, `unit-type-config.ts` |
| Log presets | Production-ready | `prisma/apply-log-template-presets.mjs` |
| LTC HR enums | Production-ready | `ChrcStatus`, etc. |
| EVS statuses | Production-ready | `RoomAreaOperationalStatus` |

### Schema (new)

| Model | Purpose |
|-------|---------|
| `IndustryProfile` | Pack identifier + config JSON |
| `Facility.industryProfileId` | Selected pack |

### Files

| File | Change |
|------|--------|
| `src/lib/department-nav.ts` | **Major** — remove hardcoded keys |
| `src/lib/ensure-default-departments.ts` | Pack-driven defaults |
| `src/lib/unit-type-config.ts` | Pack-driven unit types |
| `prisma/seed.mjs` | Pack-aware seed |
| `prisma/apply-log-template-presets.mjs` | Pack templates |
| `scripts/provision-facility.mjs` | `--industry` flag |
| `src/app/(protected)/admin/departments/page.tsx` | Pack labels |
| **New** `src/lib/industry/` | Profile loader, terminology |

### UI copy sweep

All user-facing strings referencing "Units", LTC-specific terms — grep-driven pass across `src/components/` and `src/app/`.

---

## Route inventory (current → target zone)

| Current route | Zone (target) | Primary wave |
|---------------|---------------|--------------|
| `/dashboard` | Operations Center | 2 |
| `/unit/[unitId]` | Locations → Unit Workspace | 3 |
| `/today/*` | Today's Work | 4 |
| `/staffing` | Today's Work / Review | 4 |
| `/logs` | Administration + Workspace embed | 3, 7 |
| `/menus` | Administration (dietary) | 1 |
| `/evs` | Operations (EVS mode) | 1 |
| `/repairs` | Issue & Recovery | 8 |
| `/assets` | Administration | 1 |
| `/employees` | Administration | 1 |
| `/reports` | Review | 2 |
| `/units` | Administration (Locations registry) | 1, 3 |
| `/admin/*` | Administration | 1 |
| `/knowledge` | Administration + contextual | 9 |

---

## Model inventory by wave

| Model | W1 | W2 | W3 | W4 | W5 | W6 | W7 | W8 | W9 | W10 | W11 | W12 |
|-------|----|----|----|----|----|----|----|----|----|-----|-----|-----|
| AppRoute | ✓ | | | ✓ | | | | | | | ✓ | ✓ |
| Unit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |
| LogSubmission | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | ✓ | | |
| Repair | | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | | ✓ | | |
| ScheduleEntry | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | | |
| OperationInstance | | | | | ✓ | ✓ | ✓ | | | | | |
| Task | | | | | | | ✓ | ✓ | ✓ | | | |
| KnowledgeArticle | | | | | | | | | ✓ | ✓ | | |
| Organization | | | | | | | | | | | ✓ | ✓ |
| IndustryProfile | | | | | | | | | | | | ✓ |

---

## Quick file index by directory

```
src/
├── app/
│   ├── (protected)/
│   │   ├── dashboard/page.tsx          → W2, W6, W8, W10
│   │   ├── unit/[unitId]/page.tsx      → W3, W6, W8
│   │   ├── today/**                      → W4 (new)
│   │   ├── staffing/                     → W4
│   │   ├── logs/                         → W3, W7, W9
│   │   ├── repairs/                      → W7, W8
│   │   ├── evs/                          → W8
│   │   ├── units/                        → W3, W7, W12
│   │   ├── reports/                      → W2
│   │   ├── admin/                        → W1, W9, W11, W12
│   │   └── employees/                    → W1 (admin zone)
│   └── api/auth/                         → W1, W3, W11
├── components/
│   ├── app-shell.tsx                     → W1, W11
│   ├── top-nav.tsx                       → W1
│   ├── left-sidebar.tsx                  → W1, W6
│   └── readiness-chip.tsx                → W6 (new)
└── lib/
    ├── department-nav.ts                 → W1, W12
    ├── route-permissions.ts              → W1, W4
    ├── readiness/                        → W6 (new)
    ├── operations/                       → W5 (new)
    ├── work/                             → W7 (new)
    ├── knowledge/                        → W9 (new)
    ├── ai/                               → W10 (new)
    └── industry/                         → W12 (new)
```

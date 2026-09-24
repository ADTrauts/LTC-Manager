# Modernization Roadmap

**Status:** Active implementation guide  
**Date:** 2026-07-07  
**Application:** `ltc-manager/` (Next.js monolith)

Twelve modernization waves transform the existing LTC Manager MVP into the certified platform vision. Waves are **ordered by dependency** and **aligned with ADL-001 through ADL-009**.

**Sequence note:** Waves 2 and 6 overlap for Dietary Operational Mode. Wave 6 **v0** (server-side computed readiness, no migration) may ship inside Wave 2. Wave 6 **v1** (formal Readiness aggregate, background jobs) follows Wave 5.

---

## Wave dependency overview

```
W1 Shell & Nav
 ├── W2 Operations Center ──► W6 Readiness (v0 may merge here)
 │         └── W4 Supervisor / Today's Work
 ├── W3 Unit Workspace
 ├── W5 Operations Engine
 │         └── W6 Readiness (v1)
 │                   └── W7 Work Engine
 │                             └── W8 Issue & Recovery
 W9 Knowledge ──► W10 Operational AI
 W11 Organization / Multi-site
 W12 Industry Configuration
```

---

## Wave 1 — Application Shell & Navigation

| Field | Detail |
|-------|--------|
| **Purpose** | Reorganize navigation from module-centric to **zone-centric** (Operations Center, Locations, Today's Work, Review, Administration) per Product Reference. |
| **Business value** | Users find work by role and operational context, not by database module names. Reduces cognitive load for managers and floor staff. |
| **Major deliverables** | Five-zone nav model; role-based default homes; department as **mode lens** (not parallel app); Locations rail with readiness placeholder; rename "Units" → "Locations" in UI; kiosk/tablet/desktop behavior per [01_NAVIGATION_SYSTEM.md](../product-reference/01_NAVIGATION_SYSTEM.md); update `AppRoute` labels and nav order in seed. |
| **Dependencies** | None — first wave. |
| **Estimated effort** | **Medium** — 1–2 weeks (nav components, route-permissions, department-nav, proxy allowlists, seed). |
| **Risk** | **Medium** — RBAC and department cookie allowlists are hardcoded; breaking nav breaks all roles. |
| **Acceptance criteria** | Manager lands on Operations Center (`/dashboard` or alias); employee/PIN lands on Locations or locked unit; five zones identifiable in shell; department switcher filters nav without hiding critical routes; all existing routes reachable; no regression in proxy auth. |
| **Git milestone** | `wave-01-shell-navigation` |

**Capability alignment:** Enables all capabilities through correct IA.  
**Certified refs:** Product Reference 01, UX Index, ADL-002.

---

## Wave 2 — Operations Center

| Field | Detail |
|-------|--------|
| **Purpose** | Repackage `/dashboard` as **Operations Center** — exceptions-first manager home for Dietary Operational Mode. |
| **Business value** | Manager answers "Are we ready? What needs me?" in under 60 seconds ([FIRST_PRODUCT_SLICE](../platform-vision/FIRST_PRODUCT_SLICE.md)). |
| **Major deliverables** | Operation header (meal period + phase from existing servery/meal data); site pulse summary; exception-first card order (call-downs, blocked units, failed logs, open issues, staffing gaps); rename Dashboard → Operations Center in UI; SCR-01 conformance; optional `/operations` route alias with redirect from `/dashboard`. |
| **Dependencies** | Wave 1 (zone nav, mode lens). |
| **Estimated effort** | **Medium** — 1–2 weeks. |
| **Risk** | **Low–Medium** — mostly UI repackaging of existing data; card ordering changes manager habits. |
| **Acceptance criteria** | Default card order matches Product Reference 02; meal period banner accurate; exceptions surface before birthdays/secondary; drill-down to unit/staffing/repairs preserved; dietary mode card set distinct from EVS/plant when department cookie set. |
| **Git milestone** | `wave-02-operations-center` |

**Optional sub-milestone:** Ship Readiness v0 chips (Wave 6) here if scoped small.

---

## Wave 3 — Unit Workspace

| Field | Detail |
|-------|--------|
| **Purpose** | Elevate `/unit/[unitId]` to certified **Unit Workspace** — location-scoped execution surface. |
| **Business value** | Floor staff answer "What do I do here, now?" without hunting modules. |
| **Major deliverables** | Single-decision layout per Product Reference 03; operation context header; prioritized work queue (logs due, servery controls, open issues); quick actions (meal ready/started, log submit, report issue); readiness chip on workspace; PIN/kiosk optimized density; SCR-02 conformance. |
| **Dependencies** | Wave 1 (Locations rail); Wave 2 (shared readiness vocabulary). |
| **Estimated effort** | **Medium** — 1–2 weeks. |
| **Risk** | **Low** — extends production-ready unit page; primary risk is layout regression for kiosk. |
| **Acceptance criteria** | Employee completes log + servery mark in &lt; 3 taps from workspace; operation context visible; open repairs/issues visible; no admin noise on unit page; kiosk lock behavior unchanged. |
| **Git milestone** | `wave-03-unit-workspace` |

---

## Wave 4 — Supervisor & Today's Work

| Field | Detail |
|-------|--------|
| **Purpose** | Introduce **Today's Work** zone — supervisor multi-location oversight (walk list, coverage, handoffs). |
| **Business value** | Supervisors answer "Where should I be? What is slipping?" without assembling mental model from scattered pages. |
| **Major deliverables** | New route `/today` (or `/todays-work`) with sub-views: Walk list (SCR-03), Coverage (SCR-04), Handoffs (SCR-05); supervisor default nav includes Today's Work; walk list ordered by readiness/exceptions; coverage integrates staffing grid shortcuts; call-down v0 list (AssignmentOverride with call-down reason template). |
| **Dependencies** | Waves 1–3; staffing and readiness signals. |
| **Estimated effort** | **Large** — 2–3 weeks. |
| **Risk** | **Medium** — new route surface; supervisor role permissions must be correct. |
| **Acceptance criteria** | Supervisor+ sees Today's Work in nav; walk list shows all active locations with status; coverage links to staffing with date/unit pre-filled; call-down open list visible; Product Reference 04 flows achievable. |
| **Git milestone** | `wave-04-supervisor-todays-work` |

---

## Wave 5 — Operations Engine

| Field | Detail |
|-------|--------|
| **Purpose** | Introduce explicit **Operation** / **OperationInstance** entity — bounded operational rhythm (e.g., "Breakfast 2026-07-07"). |
| **Business value** | Unifies time-scoped work: staffing expectations, logs due, readiness, issues for a service window. |
| **Major deliverables** | Prisma models `OperationDefinition` + `OperationInstance` (or equivalent); link to `MealType`, date, department; operation-scoped queries; Operations Center header reads from OperationInstance; background seed/sync from meal times; API for "active operation" context passed to pages. |
| **Dependencies** | Waves 2–4 (surfaces that consume operation context). |
| **Estimated effort** | **Large** — 2–4 weeks (schema + migration + lib + UI wiring). |
| **Risk** | **High** — new core entity; migration and backfill required; must not break existing meal/servery flows. |
| **Acceptance criteria** | Active operation computable for dietary department; logs/staffing filterable by operation instance; Operations Center header uses OperationInstance; existing servery events remain valid; rollback migration documented. |
| **Git milestone** | `wave-05-operations-engine` |

---

## Wave 6 — Readiness Engine

| Field | Detail |
|-------|--------|
| **Purpose** | Formal **Readiness** aggregate — know if service can start or continue (CAP-01). |
| **Business value** | Site-wide and per-location readiness: Complete / In progress / Blocked with explicit rules. |
| **Major deliverables** | **v0 (may ship in Wave 2):** server-side composite from logs, servery, repairs, staffing — no new tables. **v1:** `ReadinessSnapshot` or computed service in `src/lib/readiness/`; blocked rules configurable; readiness chips on Locations rail and Operations Center; missed-log detection job (partial → full). |
| **Dependencies** | Wave 5 preferred for v1; Wave 2 sufficient for v0. |
| **Estimated effort** | **Medium (v0)** / **Large (v1)** — 1–3 weeks. |
| **Risk** | **Medium** — incorrect blocked rules cause false alarms or missed risk. |
| **Acceptance criteria** | Readiness chip on every active location in rail; blocked definition matches FIRST_PRODUCT_SLICE (failed log, HIGH/URGENT open repair, zero staffing at servery); manager sees aggregate site pulse; rules unit-testable. |
| **Git milestone** | `wave-06-readiness-engine` |

---

## Wave 7 — Work Engine

| Field | Detail |
|-------|--------|
| **Purpose** | Generalize episodic work — logs, repairs, inspections — into unified **Work** / **Task** model (ADL-007). |
| **Business value** | One inbox for assignable, completable work; foundation for call-downs, supply tasks, ad-hoc supervisor tasks. |
| **Major deliverables** | `Task` model with subtypes (LOG, REPAIR, INSPECTION, COVERAGE, AD_HOC); adapter layer over existing `LogSubmission`, `Repair`; inspection workflow (currently metadata-only on `UnitDepartmentResponsibility`); task inbox API; migrate UI gradually — logs/repairs pages remain, backed by Task where appropriate. |
| **Dependencies** | Waves 5–6; ADL-007 (logs preserved, not replaced). |
| **Estimated effort** | **Very large** — 4–6 weeks. |
| **Risk** | **High** — domain unification touches core flows; must preserve log compliance pipeline. |
| **Acceptance criteria** | Log submit/history unchanged for users; Repair create/update unchanged; Task record created/synced for new log submissions and repairs; inspection checklist creatable and submittable; no duplicate work tracking UI yet required. |
| **Git milestone** | `wave-07-work-engine` |

---

## Wave 8 — Issue & Recovery

| Field | Detail |
|-------|--------|
| **Purpose** | Evolve `Repair` toward generic **Issue** with types (equipment, supply, safety, housekeeping) per ADL-008; first-class recovery UX. |
| **Business value** | CAP-04 — survive disruption; supply shorts and safety issues tracked alongside equipment. |
| **Major deliverables** | `IssueType` dimension on Repair or Issue table; supply short quick form (FIRST_PRODUCT_SLICE minimum); issue board on Operations Center; recovery state machine visible in UI; EVS quick ticket pattern extended to dietary unit dashboard; SCR-06 Issue detail; link issues to readiness blocked rules. |
| **Dependencies** | Waves 3, 6, 7 (task/issue linkage). |
| **Estimated effort** | **Large** — 2–4 weeks. |
| **Risk** | **Medium** — schema evolution on production-ready repairs; routing logic must hold. |
| **Acceptance criteria** | Create supply short from unit in &lt; 30s; issue types filterable; open issues on Operations Center and Unit Workspace; repair routing tests pass; EVS board ticket flow unchanged. |
| **Git milestone** | `wave-08-issue-recovery` |

---

## Wave 9 — Knowledge Layer

| Field | Detail |
|-------|--------|
| **Purpose** | Operational knowledge at point of work (CAP-07) — beyond union handbook PDF. |
| **Business value** | SOPs, instructions on templates, contextual help reduce errors and training load. |
| **Major deliverables** | Knowledge artifact model (SOP, checklist instruction, link); attach to LogTemplate, Unit, Asset; in-context drawer on Unit Workspace and log submit; union handbook integrated into knowledge index; search within site knowledge; SCR-adjacent help surfaces. |
| **Dependencies** | Waves 3, 7 (work moments for attachment). |
| **Estimated effort** | **Large** — 3–4 weeks. |
| **Risk** | **Low–Medium** — additive; file storage abstraction may be needed (local → object storage). |
| **Acceptance criteria** | Template shows instruction on submit; handbook findable from workspace; knowledge scoped by department; no regression to handbook upload API. |
| **Git milestone** | `wave-09-knowledge-layer` |

---

## Wave 10 — Operational AI

| Field | Detail |
|-------|--------|
| **Purpose** | Operational intelligence partner (CAP-08) — structured AI moments, not chatbot. |
| **Business value** | Morning brief, exception summarization, suggested next action; reduces manager scan time. |
| **Major deliverables** | AI provider integration (env-configured); Morning Brief card on Operations Center (optional, dismissible); exception summarization behind feature flag; prompt templates grounded in readiness/issue/staffing data; audit log of AI outputs; Product Reference 08 conformance. |
| **Dependencies** | Waves 2, 6, 8 (rich operational state); telemetry foundation. |
| **Estimated effort** | **Large** — 3–5 weeks. |
| **Risk** | **High** — cost, latency, hallucination in operational context; privacy. |
| **Acceptance criteria** | AI off by default; when on, brief ≤ 3 sentences; no PII sent without policy; manager can dismiss; failures degrade gracefully (no blocking). |
| **Git milestone** | `wave-10-operational-ai` |

---

## Wave 11 — Organization & Multi-site Foundation

| Field | Detail |
|-------|--------|
| **Purpose** | First-class **Organization** above `Facility` (ADL-004); cross-site navigation and rollup. |
| **Business value** | Contract operators manage many sites; shared templates and district visibility. |
| **Major deliverables** | `Organization` model; `Facility.organizationId`; org admin role; site switcher; org-level template library (log presets); cross-site dashboard stub; billing attachment at org level (design only if Stripe scope large); migration plan for existing facilities. |
| **Dependencies** | Waves 1–8 stable; ADL-003 unwind planned. |
| **Estimated effort** | **Very large** — 4–8 weeks. |
| **Risk** | **Very high** — tenancy model change; every query scoped by facility today. |
| **Acceptance criteria** | Single-org deployment works identically to today; multi-facility org can switch sites; no cross-site data leak; JWT/session includes org + site context; rollback documented. |
| **Git milestone** | `wave-11-organization-multisite` |

---

## Wave 12 — Industry Configuration Layer

| Field | Detail |
|-------|--------|
| **Purpose** | Industry packs — configurable terminology, department sets, compliance presets (ADL-006). |
| **Business value** | Same platform serves LTC, K-12, hospital, corporate dining without code forks. |
| **Major deliverables** | `IndustryProfile` config; data-driven department nav (replace hardcoded DIETARY/EVS/PLANT keys); neutral UI copy layer; preset packs for log templates and unit types; LTC-specific enums isolated to pack; provisioning CLI accepts industry argument. |
| **Dependencies** | Wave 11 preferred; Wave 1 department-nav refactor required. |
| **Estimated effort** | **Very large** — 4–6 weeks. |
| **Risk** | **High** — hardcoded keys pervasive in `department-nav.ts`, seed, EVS statuses. |
| **Acceptance criteria** | LTC pack reproduces current behavior; second pack (e.g., K-12) demonstrable in dev; no Prisma enum rename required in v1; industry selectable at provision time. |
| **Git milestone** | `wave-12-industry-configuration` |

---

## Cross-wave themes

| Theme | Waves | Notes |
|-------|-------|-------|
| Dietary first wedge | 2–4, 6, 8 | ADL-005; EVS/plant extend later |
| Review zone | 2+ | `/reports` maps to Review; rename in Wave 1–2 |
| Administration | 1 | `/admin/*` stays; exit returns to ops context |
| Background jobs | 6, 10 | Missed logs, notifications — ADL-009 worker when needed |
| Notifications | 4, 8 | Stub today; thin in-app first |

---

## Effort summary

| Wave | Effort | Risk |
|------|--------|------|
| 1 Shell & Nav | Medium | Medium |
| 2 Operations Center | Medium | Low–Medium |
| 3 Unit Workspace | Medium | Low |
| 4 Supervisor / Today's Work | Large | Medium |
| 5 Operations Engine | Large | High |
| 6 Readiness Engine | Medium–Large | Medium |
| 7 Work Engine | Very large | High |
| 8 Issue & Recovery | Large | Medium |
| 9 Knowledge Layer | Large | Low–Medium |
| 10 Operational AI | Large | High |
| 11 Organization / Multi-site | Very large | Very high |
| 12 Industry Configuration | Very large | High |

**Total rough horizon:** 9–18 months at sustained pace, assuming one wave at a time with validation.

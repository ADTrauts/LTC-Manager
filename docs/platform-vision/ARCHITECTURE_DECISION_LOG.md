# Architecture Decision Log

**Status:** Planning document  
**Date:** 2026-07-07

Major architectural and product decisions for the platform evolution. Entries are **decided** unless marked *Proposed*.

Format: **Decision** → **Context** → **Consequences**

---

## ADL-001: Keep the repository; do not restart

| | |
|---|---|
| **Decision** | Continue building on the existing `ltc-manager` Next.js monolith. **No greenfield rewrite.** |
| **Context** | Architecture review confirms Phases 0–6 and extensions delivered: auth, units, logs, staffing, employees/HR, menus, EVS, assets/repairs, reports, onboarding, Stripe, PIN/kiosk. A restart would discard working patterns and 31 migrations. |
| **Consequences** | New platform capabilities extend existing modules and schema incrementally. Technical debt (global asset codes, department keys in code) is **refactored later**, not used as justification to restart. Branding may evolve; repo name may lag product name. |

---

## ADL-002: Unit remains the operational anchor

| | |
|---|---|
| **Decision** | **`Unit`** (UI: "Location") stays the primary navigation and execution context for floor work. |
| **Context** | Unit-driven sidebar, `/unit/[unitId]` dashboards, log assignments per unit, servery meal events per unit, and kiosk unit lock are core differentiators. Architecture review rates this **production-ready** and aligned with multi-node dining. |
| **Consequences** | Target domain may introduce alias concepts (`Location`, `ServicePoint`) in product language, but **implementation anchor remains `Unit`** until a deliberate migration. Parent hierarchy (`parentUnitId`) supports buildings/floors/zones without a separate Location table short-term. |

---

## ADL-003: Facility remains tenancy root for now

| | |
|---|---|
| **Decision** | **`Facility`** remains the data and session tenancy boundary (`facilityId` on JWT, queries, and models). |
| **Context** | Entire codebase scopes to `facilityId`. One facility per deployment is the current product reality. Multi-site is anticipated in schema comments but not productized. |
| **Consequences** | New features default to `facilityId` scope. Cross-facility reporting, org-level admin, and district dashboards **wait** on ADL-004's organization model. Do not prematurely add `organizationId` to every table without a migration plan. |

---

## ADL-004: Broader organization / multi-site model is future target

| | |
|---|---|
| **Decision** | Introduce a first-class **`Organization`** (operating company / contract operator / district) **above** `Facility` in the **target** domain model — **not implemented yet**. |
| **Context** | `Facility.managementCompanyName` is a string, not a relation. Contract dining ICP requires repeating processes across many sites. Architecture review lists multi-facility district as **stub / deferred**. |
| **Consequences** | Planning and new APIs should **avoid designs that assume Facility is the top of the hierarchy forever**, but **no schema migration until slice priorities allow**. Interim: multiple facilities can coexist in one database for engineering; product does not expose org rollup. |

---

## ADL-005: Dietary remains the first wedge

| | |
|---|---|
| **Decision** | **Dietary Operational Mode** is the first product slice on the path to the broader platform. EVS and plant ops extend existing modules but do not supersede dietary as the entry wedge. |
| **Context** | Memory-bank strategy: dining-first, then adjacent ops. Codebase is feature-rich for dietary (menus, servery timing, logs, staffing) and partial for supplies, call-downs, generic tasks. |
| **Consequences** | [FIRST_PRODUCT_SLICE.md](./FIRST_PRODUCT_SLICE.md) defines scope. New verticals (K-12, hospital, university) enter via **configuration and industry packs**, not parallel apps. |

---

## ADL-006: Industry-neutral core language in platform layer

| | |
|---|---|
| **Decision** | Platform concepts use **neutral terms** in new docs, APIs, and UI copy where feasible: *site*, *location*, *operation*, *issue*, *supply item* — not LTC-only labels in shared layers. |
| **Context** | Product name "LTC Manager" and models like `ChrcStatus`, `RoomAreaOperationalStatus` (DISCHARGE, ISOLATION) embed LTC/clinical adjacency. Target platform serves hospitals, schools, universities, corporate dining. |
| **Consequences** | **Refactor later:** rename user-facing strings, extract LTC-specific enums to industry packs. **Preserve:** existing Prisma enum names until migrations are scheduled. New shared abstractions avoid "resident," "nursing unit," "LTC" in core module names. |

---

## ADL-007: Log framework is the compliance engine; Task is a future unifier

| | |
|---|---|
| **Decision** | Keep **`LogTemplate` → `LogAssignment` → `LogSubmission`** as the compliance/checklist engine. Introduce a generic **`Task`** (or **`Operation`**) concept in target model to unify episodic work — **not replacing logs in v1 slice**. |
| **Context** | Logs are production-ready. Generic tasks do not exist; repairs and overrides cover adjacent patterns. Constitution: "operations before documentation" — logs already attach to work moments. |
| **Consequences** | First slice may use logs + repairs for call-downs and equipment issues. Task unification is **missing foundation** — design in [DOMAIN_MODEL_TARGET.md](./DOMAIN_MODEL_TARGET.md), implement after slice proves rhythm. |

---

## ADL-008: Repair / Issue model evolves toward generic Issue

| | |
|---|---|
| **Decision** | Treat **`Repair`** as the current implementation of **equipment/facility issues**; target platform generalizes to **`Issue`** with type (equipment, supply, safety, housekeeping) — **refactor later**, not big-bang rename. |
| **Context** | `Repair` supports corrective/preventive work orders, department routing, EVS quick ticket. Architecture review: production-ready for maintenance. |
| **Consequences** | Dietary slice uses existing `/repairs` and unit/EVS flows. New issue types (e.g. supply short) may initially use repairs or a thin extension table before full Issue abstraction. |

---

## ADL-009: Monolith first; extract services only on proven pain

| | |
|---|---|
| **Decision** | Remain a **Next.js modular monolith** (Server Components + Server Actions + Prisma). No microservices split for the first platform slice. |
| **Context** | Architecture review: appropriate for single-facility MVP scale. Weaknesses (background jobs, rate limits, file storage) do not yet justify distributed architecture. |
| **Consequences** | Introduce **job queue or worker process** only when missed-log detection, notifications, or exports block the slice. Prefer shared storage abstraction before multi-instance deploy. |

---

## ADL-010: Dual auth (User + Employee PIN) is preserved

| | |
|---|---|
| **Decision** | Retain **email `User` sessions** and **`Employee` PIN sessions** with `authKind` on JWT. |
| **Context** | Production-ready; maps to laptop managers vs floor tablets. Architecture review lists as strength. |
| **Consequences** | New operational actions must support **both submitter types** where floor capture matters (`submittedBy` vs `submittedByEmployeeId` pattern). SSO is future; does not replace PIN for floor. |

---

## ADL-011: DB-driven route permissions preserved

| | |
|---|---|
| **Decision** | Continue **`AppRoute` + `RoleRoutePermission`** for nav and access; extend with operation-mode or feature-flag dimensions later if needed. |
| **Context** | FA-configurable matrix is production-ready. Reduces deploy coupling for permission tweaks. |
| **Consequences** | New routes must register in seed/migration for permissions. Department nav (`department-nav.ts`) remains **refactor later** to data-driven rules vs hardcoded DIETARY/EVS/PLANT keys. |

---

## ADL-012: No database migrations in planning phase

| | |
|---|---|
| **Decision** | Documents in `docs/platform-vision/` **do not authorize** schema changes. [DOMAIN_MODEL_TARGET.md](./DOMAIN_MODEL_TARGET.md) is conceptual only. |
| **Context** | User instruction: planning only. Architecture review documents 31 existing migrations as forward-only discipline. |
| **Consequences** | Implementation phases produce separate migration proposals referencing ADL entries and slice scope. |

---

## ADL-013: Facility-plus-departments commercial model

| | |
|---|---|
| **Decision** | Charge by **facility + licensed departments**, never by seats. Keep the existing Stripe customer and card-on-file path on `Facility`. Do not treat `showInEmployeeApp` or feature flags as licenses. |
| **Context** | Billing today is a SetupIntent stub: customer + default payment method, no Products, Prices, Subscriptions, or entitlements. Working list prices: **$299/month** for the first department, **+$149** each additional, **$999** facility ceiling, unlimited users. Setup/implementation is **optional** — $0 for self-setup via `/setup`; assisted implementation is a separate one-time fee. Invoice owner remains the parent organization when multi-site is productized (ADL-004); Stripe customer stays on Facility until then. |
| **Consequences** | Catalog and quote math live in `src/lib/billing/`. Entitlement rows are additive and **unenforced** until `BILLING_ENTITLEMENTS_ENABLED` is explicitly on. Stripe Billing + Checkout (`mode: subscription`) is the charging path — not PaymentIntents, not Metronome. Separate Stripe Products for facility-base, additional department, whole-facility ceiling, and assisted setup. |

---

## Decision index

| ID | Title | Status |
|----|-------|--------|
| ADL-001 | Keep repo, no restart | Decided |
| ADL-002 | Unit = operational anchor | Decided |
| ADL-003 | Facility = tenancy root (now) | Decided |
| ADL-004 | Organization / multi-site (future) | Decided |
| ADL-005 | Dietary first wedge | Decided |
| ADL-006 | Industry-neutral core language | Decided |
| ADL-007 | Logs now; Task later | Decided |
| ADL-008 | Repair → Issue (later) | Decided |
| ADL-009 | Monolith first | Decided |
| ADL-010 | Dual auth preserved | Decided |
| ADL-011 | DB route permissions preserved | Decided |
| ADL-012 | No migrations in planning | Decided |
| ADL-013 | Facility-plus-departments billing | Decided |

---

## References

- [docs/architecture-review/07-architecture-assessment.md](../architecture-review/07-architecture-assessment.md) — preserve list
- [PRODUCT_CONSTITUTION.md](./PRODUCT_CONSTITUTION.md) — principles
- [CURRENT_STATE_VS_TARGET_STATE.md](./CURRENT_STATE_VS_TARGET_STATE.md) — gap mapping

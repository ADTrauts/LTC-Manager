# Project Overview

## Product

**Vssyl** is a Business Operations Platform. Departments operate within Vssyl. The customer / facility name is configured per deployment and is not the product title. Historical docs may still say LTC Manager.

Current architecture authority: `docs/product/01_PRODUCT_CONSTITUTION.md`, certified through `06935aef0d2e257c1ff616694992f522360a83c1`.

Implemented platform mechanisms: one physical facility tree, Location Functions, Operational Cycles, Work, one Record engine, Audit / Reports, Assets and repairs. Dietary and EVS are Department Products. Plant Operations Product design has not started.

The module list below is the earlier MVP inventory. It is not the current architecture map.

## Core Pattern

- Top modules build reusable system data.
- Units are created by admins (not hardcoded).
- Sidebar is generated from active units.
- Unit dashboards run day-to-day work.

## Implemented MVP Scope

- **Self-serve acquisition (delivered):** public `/` hero, `/signup` first-admin bootstrap, `/setup` guided onboarding (facility → managers → Department Products → Checkout → locations), proxy onboarding gate until complete; legacy facilities backfilled so existing GMs are not stuck in setup.
- **GM roster alignment:** first GM from signup gets a matching **`Employee`** row; **`/employees`** auto-ensures a roster row for email-session GMs if missing; optional **`npm run db:backfill-gm-roster`** for CLI repair.
- Auth + role-aware routing
- Units builder (CRUD, ordering, meal times)
- Logs engine (templates, fields, assignments, submissions, history)
- Dashboards (global + unit operational cards)
- Employees + staffing (defaults, schedule entries, overrides)
- Assets + repairs (registry, ticketing, updates)
- Reports (logs, temp failures, repairs, staffing coverage)

## Current Module Coverage

- `Dashboard`: live compliance, staffing, and repair signals
- `Units`: create/edit/activate/reorder + meal times
- `Employees`: directory + default assignment management; **Manager+** secondary tabs under the section (**Points**, **Terminations**, **HR audit**, **Import** — **Import** last) instead of separate top-nav items
- `Logs`: template builder + assignment + submission UI
- `Staffing`: schedule and override workflows
- `Assets`: vendor + asset registry + status updates
- `Repairs`: ticket intake + status/update workflow
- `Reports`: filterable operational report views
- `Organization` (**Admin →** `/admin/organization`, GM): facility display name + management company + **Apply device binding** (HttpOnly **`ltc_device_facility`**; optional **`ltc_device_unit`** unit lock for floor tablets)
- **PIN / device:** Email sessions vs **Employee** PIN sessions (`authKind`); **Floor PIN** + unit access on **Employees**; login **LoginGate** (PIN pad when facility-bound); unit-locked tablets force that unit after PIN, optional assignment warning + **`KioskUnitPinLoginEvent`** audit, and **Locations** sidebar greys other units
- **Greenfield provisioning:** `npm run db:provision` (see `runbook.md`) — optional alternative to full `db:seed`

# Project Overview

## Product

**LTC Manager** is a unit-driven operations platform for long-term care nutrition workflows (customer facility name is configured per deployment, not baked into the product title).

## Core Pattern

- Top modules build reusable system data.
- Units are created by admins (not hardcoded).
- Sidebar is generated from active units.
- Unit dashboards run day-to-day work.

## Implemented MVP Scope

- **Self-serve acquisition (delivered):** public `/` hero, `/signup` first-admin bootstrap, `/setup` guided onboarding (facility → managers → locations → billing), Stripe card-on-file when configured, proxy onboarding gate until complete; legacy facilities backfilled so existing GMs are not stuck in setup.
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

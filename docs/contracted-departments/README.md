# Contracted Department Authority program

Accepted October 20, 2026, and revised the same afternoon. This program decides who controls each Department, who sees it, how a vendor runs one, and who owns the data.

It uses `CDA-` identifiers. It is separate from the [Dashboard program](../dashboard/README.md) (`DSH-`) and the [onboarding program](../onboarding/README.md) (`ONB-`). It applies the [Product Constitution](../product/01_PRODUCT_CONSTITUTION.md) and schedules the amendments it requires ([CDA-D15](./DECISIONS.md#cda-d15--superseded-statements-and-amendment-schedule--accepted-october-20-2026)).

## The model, with Terrace View

ECMC owns Terrace View. ECMC runs Environmental Services and Facility Plant Operations itself. Metz Culinary runs Food & Nutrition.

- **The Facility Administrator (one person, ECMC)**
  - owns the account: billing, adding Departments, choosing each Department's operator, vendor relationships, rooms and buildings, account security
  - can hand the role to a successor
  - if they leave without doing so, ECMC's organization admin appoints the next one
- **EVS and Plant (self-operated)**
  - The Facility Administrator names each head when the Department is added. They may name themselves.
  - The head and the managers the head allows run the Department.
  - The Facility Administrator can view everything but changes nothing unless they are the head.
- **Food & Nutrition (vendor-run)**
  - Metz Culinary is created in Vssyl Console, with its first administrator and its first members. Terrace View then attaches that company to Food & Nutrition.
  - Metz's company admin names the GM from Metz's own account.
  - Until the GM accepts, the Facility Administrator can still set things up.
  - After that, Metz runs it inside the rooms the facility assigned. The GM sets up Metz's people, schedule, operating rhythm, work plans, menus, Metz's own forms, and the assets Food & Nutrition uses. The facility keeps the building and the room assignments.
  - The Facility Administrator sees high-level work on the Dashboard, and can open its compliance Records read-only, for example for a survey.
  - Metz leaders sign in with Metz accounts. Hourly Metz staff use a PIN at the facility.
- **Each Department sees only its own.** The EVS head sees EVS employees, the rooms assigned to EVS, and EVS schedules, not Plant's.
- **Assets are shared with Plant.**
  - The operating partner can add an asset for their Department and set who owns it, who maintains it, and which vendor fixes it.
  - Title is the facility or that partner. Equipment Metz buys can still belong to Terrace View. Proprietary Metz equipment is titled to Metz.
  - The Facility Administrator and Plant see every asset while it is on site. Food & Nutrition and EVS each see only their own.
  - Each asset's maintainer, Plant or Metz, is set by the head of the Department that uses it. The maintainer runs and pays for repairs, with its own repair companies.
  - If Metz leaves, facility-titled assets and their repair history stay. Metz-titled assets leave with Metz, and Terrace View keeps a closed note that they were on site. Metz's costs go with Metz.
- **Plant still handles Food & Nutrition's repair requests.** Those records stay with the facility.
- **If Metz's contract ends:**
  - Metz's Records, setup and employee records are archived with Metz.
  - ECMC can still read the compliance Records for surveyors.
  - The next operator starts from Vssyl's standard starters.
- **Nothing legacy at the first real customer.** There are no customers yet; every account is a test account. The [Legacy Retirement program](../legacy-retirement/README.md) does the retiring.

## Program records

| Record | Purpose |
|---|---|
| [Current-state audit](./CURRENT_STATE_AUDIT_2026-10-20.md) | How Department data, accounts and the Facility Administrator role work today |
| [Decisions](./DECISIONS.md) | The model, decisions (`CDA-D01`…), open items (`CDA-Q01`…) and the revision history |
| [Architecture](./ARCHITECTURE.md) | Access modes, the resolver, owners, enforcement, single Facility Administrator, vendor operation, operator-period data, tests |
| [Phased plan](./PHASED_PLAN.md) | CDA-00 through CDA-09, and order with the Dashboard and Legacy Retirement |
| [Phase tracker](./PHASE_TRACKER.md) | The single status and authorization record |
| [CDA-06 design](./CDA-06_DESIGN.md) | Operator-period stamp, backfill, reads, archive, and survey Records. Accepted October 22, 2026. |

## Boundaries

- **Schema changes only where a phase says so.** They are forward-only and approved explicitly. No `prisma migrate reset`.
- **No commercial side effects.** No change to release status, sellability, entitlements or billing. EVS stays DEVELOPMENT.
- **No new Plant features.** No parallel Records model.
- **Behind a flag.** Staging enforcement is on. The code default and the production project stay off until production enablement, which still needs LEG-07 or an explicit exception.
- **Next.js 16.** Read the relevant guide in `node_modules/next/dist/docs/` before writing code.

## Glossary

| Term | Meaning |
|---|---|
| **Facility Administrator** | The one person who owns a facility's account and its governance |
| **Self-operated** | A Department run by the facility's own Organization |
| **Vendor-run** | A Department run by another Organization (the vendor) under a date-effective operator relationship |
| **Head** | The Department head or GM (either title). Runs the Department with the managers they allow. |
| **Operator period** | One operator relationship's date range. Department data belongs to the period it was created in. |
| **Manage / View / Summary / None** | Access modes for a person on a Department ([Architecture §2](./ARCHITECTURE.md#2-access-modes)) |
| **Governance** | What the Facility Administrator controls in every Department ([CDA-D02](./DECISIONS.md#cda-d02--one-facility-administrator-per-facility-with-ownership-transfer--accepted-user-october-20-2026)) |
| **Vendor account** | A vendor person's own login across facilities, with access only to the Departments they work in |

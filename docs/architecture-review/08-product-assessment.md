# 8. Product Assessment

Based solely on existing code, schema, UI, and project documentation. **No recommendations** — only what the repository appears to be building.

---

## Product identity

**LTC Manager** is a **daily operations platform for long-term care facilities**, with a **dining and nutrition operations wedge**.

The README describes it as:

> Phase 0 foundation for a unit-driven operations platform

The memory-bank expands this to:

> A unit-driven operations platform for long-term care nutrition workflows

The product name is generic ("LTC Manager"); **facility display name is configured per deployment** (e.g. seed data uses "Terrace View" as a demo name, not the product brand).

---

## Target user and context

### Primary setting

Long-term care (nursing home / skilled nursing) **food service operations**, especially facilities with:

- **Multiple service nodes** (serveries, unit kitchens, retail)
- **Central production kitchen** plus distributed service
- **Heavy compliance burden** (temperature logs, sanitation, FIFO-style checklists)
- **Unionized dietary staff** with discipline tracking needs
- **NYS CHRC** background check tracking (explicit in HR docs)

### Reference complexity

Documentation acknowledges the reference site is **more complex than median LTC** (e.g. ~17 serveries, porters, per-node logs). The product is built to handle **hospital-style / campus-style** dining complexity and should theoretically down-level to simpler sites.

### Ideal customer profile (documented strategy)

**Contract dining operators** (food service management companies) are called out as a strong early ICP because they repeat processes across accounts. Self-operated facilities are a broader secondary market.

---

## Core product thesis

1. **Admins define the physical and organizational structure** (units, departments, meal times).
2. **The app generates navigation and dashboards from that structure** — not from hardcoded facility layouts.
3. **Frontline staff execute daily work** through unit dashboards, logs, and PIN login on tablets.
4. **Supervisors and managers see compliance and coverage** on global dashboards and reports.
5. **HR/roster data migrates from spreadsheets** into structured employee records.

---

## What the product does today (user-facing capabilities)

A facility administrator or GM can:

- Sign up, complete onboarding, and attach a payment card.
- Configure facility name, brand color, and union handbook.
- Bind browsers/tablets to the facility (and optionally a single unit).
- Create and organize units with department responsibilities.
- Build compliance log templates and assign them to units.
- Run daily operations on unit dashboards (menus, logs, servery meal timing).
- Manage employee roster with HR, union, CHRC, and discipline data.
- Build weekly schedules and record day-of assignment overrides.
- Track assets, vendors, and maintenance work orders including PM schedules.
- Operate an EVS board for room/zone status with quick maintenance tickets.
- Build rotating menu cycles for dietary production.
- View operational reports over date ranges.
- Configure role-based route permissions and department visibility.

A floor employee (PIN user) can:

- Sign in with a 6-digit PIN on a facility-bound device.
- See allowed units in the sidebar (or a single locked unit on kiosk tablets).
- Submit logs and perform unit-scoped operational tasks within their role.
- Receive a warning (not a block) when signing into a unit they are not assigned to on a locked tablet.

---

## Module map (as shipped)

| Module | User value |
|--------|------------|
| Dashboard | "What needs attention right now?" |
| Locations (units) | "Where work happens" |
| Logs | "Are we compliant?" |
| Staffing | "Who should be where?" |
| Employees | "Who works here and are they HR-complete?" |
| Menus | "What are we serving this cycle?" |
| EVS | "What is the cleaning status of rooms/zones?" |
| Assets | "What equipment do we have?" |
| Repairs | "What is broken and who owns fixing it?" |
| Reports | "How did we perform over this period?" |
| Admin | "Configure org, permissions, departments" |

---

## What the product is NOT (per code and docs)

| Domain | Evidence of exclusion |
|--------|---------------------|
| Electronic medical records | No clinical models; strategy doc lists as non-goal |
| Payroll / timekeeping | No time clock or pay rules |
| Inventory / purchasing | No stock models or routes |
| Resident care | No resident entity |
| Inter-facility analytics | Single facility per deployment; district deferred |
| Marketing website beyond signup | Minimal landing page only |
| Full billing product | Stripe setup intent only |
| Automated email / messaging | No mailer, no message models |
| SSO / enterprise IAM | Email/password only |

---

## Go-to-market signals in code

- **Self-serve signup** at `/signup` — product is meant to be provisioned by customers, not only by implementers.
- **Stripe onboarding** — commercial intent (card on file before completion).
- **Public landing** at `/` — acquisition funnel entry.
- **Provisioning CLI** — implementer/onboarding path for managed deployments.
- **Demo seed** — sales/demo environment with known credentials.

---

## Product maturity stage

| Signal | Interpretation |
|--------|----------------|
| Phases 0–6 complete | Core MVP modules delivered |
| Phases A–E + extensions | Facility tenancy, roles, PIN, provisioning, kiosk |
| HR backlog largely shipped | Beyond original MVP scope |
| EVS + Plant ops modules | Expansion beyond pure dietary |
| memory-bank "Phase F" deferred | Not pursuing multi-facility / SSO yet |
| self-serve-smoke-test.md | Pre-deploy checklist exists — approaching operable releases |
| Unused `ModulePlaceholder` | Scaffold phase is over |

**Overall:** The repository is building a **commercial MVP / early production** product, not a prototype or proof-of-concept. It is **feature-rich for dining operations** and **thin everywhere else**.

---

## Positioning statement (derived from code + docs)

> **LTC Manager helps long-term care dining teams run multi-unit food service day-to-day** — compliance logs, staffing, menus, servery timing, equipment repairs, and employee roster/HR — **from a unit-centric tablet-friendly app**, starting with the kitchen and dining operation before expanding to adjacent facility ops (EVS, plant maintenance).

---

## User personas implied by roles

| RoleKey | Implied persona |
|---------|-----------------|
| FACILITY_ADMINISTRATOR | Facility org owner; billing, permissions, device binding |
| GM | General manager / department head hub user |
| MANAGER | Department manager; employees, reports, HR sub-areas |
| SUPERVISOR | Shift supervisor; units, staffing, assets |
| LEAD_TEAM_MEMBER | Senior floor staff (between supervisor and staff) |
| STAFF | Line staff; logs, repairs intake, unit work |

PIN sessions typically map to **STAFF through SUPERVISOR** tier employees on the roster.

---

## Competitive differentiation (as embodied in code)

1. **Multi-servery / multi-unit** execution model vs single dining room tools.
2. **Configurable compliance logs** per unit with temperature and pass/fail fields.
3. **PIN + kiosk unit lock** for real floor hardware workflows.
4. **Union HR primitives** (discipline points, handbook, separations) inside ops app.
5. **Department-scoped nav** so EVS and Plant staff see relevant tools only.

---

## Product trajectory implied (not recommended — observed from docs)

`future-projects-ltc-ops-strategy.md` describes sequencing already partially reflected in code:

- **Phase 1 (current):** Dining — largely built.
- **Phase 2 (started):** Adjacent ops — EVS board, plant assets/repairs, PM schedules exist.
- **Phase 3 (future):** Broader facility operating layer — not built.

The codebase is **mid-trajectory**: dining wedge is strong; housekeeping/maintenance patterns are emerging; clinical and enterprise HR are explicitly out of scope.

---

## One-sentence summary

The repository is building **a facility-scoped, unit-driven daily operations app for long-term care food service and adjacent environmental/maintenance workflows**, sold via self-serve signup, optimized for complex multi-servery LTC sites, with spreadsheet-replacement HR for unionized dietary teams.

# Navigation System

**Status:** Product reference — navigation and IA  
**Parent:** [00_PRODUCT_REFERENCE_INDEX.md](./00_PRODUCT_REFERENCE_INDEX.md)

---

## Design question

Navigation must answer: **Where am I in the product, and what can I do from here?**

The wrong organizing principle is **modules** (Logs, Staffing, Repairs). The right organizing principle is **operational role + operational context**.

---

## Permanent navigation areas

The product has **five permanent zones**. Users always know which zone they are in.

| Zone | Purpose | Primary users |
|------|---------|---------------|
| **Operations Center** | Site-wide situational awareness and manager decisions | Manager, dept head |
| **Locations** | List and enter Unit Workspaces | All operational roles |
| **Today's Work** | Operation-scoped tasks — staffing, handoffs, call-downs, open issues rollup | Supervisor, manager |
| **Review** | Historical operations, analytics, exports | Manager |
| **Administration** | Site setup — roster, templates, permissions, locations registry | Admin, manager (limited) |

**Operations Center** is the default **home** for managers after sign-in.

**Locations** is the default **home** for employees after sign-in (or they land directly in one location if kiosk-bound).

**Administration** is never home. It is entered from a deliberate menu and returns user to prior operational context on exit.

---

## What navigation is NOT organized by

| Organizing principle | Why not primary |
|---------------------|-----------------|
| **Modules** | Fragments one operation across tabs |
| **Database tables** | Meaningless to floor staff |
| **Org chart** | Managers don't navigate by department tree daily |
| **Feature list** | Grows without bound |

---

## What navigation IS organized by

### 1. Operations (time and commitment) — primary for managers

The **active operation** and **next operation** anchor the Operations Center header.

- "Breakfast service — Preparation"
- "Lunch service — starts in 45 min"

Secondary items (logs due, staffing) filter by **active operation** by default.

### 2. Locations (place) — primary for employees and supervisors

The **Locations rail** lists all active service points ordered by site configuration.

- Selecting a location enters **Unit Workspace**.
- Location shows readiness chip on the rail.

### 3. Departments (mode) — scope filter, not parallel app

**Operational mode** (Food Service, EVS, Plant) filters which zones and secondary nav items appear.

- A dietary manager in Food Service mode does not see EVS-only tools in primary nav.
- Facility admin may see all modes or switch mode explicitly.

Department is a **lens**, not a separate product.

### 4. Roles (capability) — what you can open

Role determines **which zones exist** and **which actions appear inside them.

- Employee: Locations + Unit Workspace only (no Operations Center).
- Supervisor: Locations + Today's Work + Operations Center (read-heavy).
- Manager: full operational zones + Administration (partial).
- Admin: all zones.

---

## Role-based navigation

### Manager

**Default landing:** Operations Center.

**Permanent access:**
- Operations Center (home)
- Locations (drill to any Unit Workspace)
- Today's Work (staffing grid, call-downs, issue list — operation-scoped)
- Review (analytics, historical — not home)
- Administration (setup)

**Primary motion:** Center → Location or Today's Work → back to Center. Loops every 15–30 minutes during service.

### Supervisor

**Default landing:** Today's Work **or** Operations Center (configurable site preference; default Today's Work if cluster assigned).

**Permanent access:**
- Today's Work (walk list, coverage map — home for motion)
- Locations (enter any Unit Workspace in cluster)
- Operations Center (read-oriented; escalate from here)
- No Administration (except location notes if permitted)

**Primary motion:** Walk list → Unit Workspace → next location. Center 2–4 times per morning.

### Employee

**Default landing:** Assigned Unit Workspace **or** Locations list (if multiple allowed).

**Permanent access:**
- Locations (if more than one)
- Unit Workspace (execution)
- Account (sign out, minimal)

**No access:** Operations Center, Today's Work, Review, Administration.

**Primary motion:** Stay in Unit Workspace unless changing location.

### Facility administrator

Same as manager plus full Administration. FA may choose Operations Center or Administration after sign-in depending on task; **operational days** should still default to Center.

---

## Device-based navigation

### Tablet kiosk (unit-locked)

- **Single location.** No Locations list — opens directly to Unit Workspace.
- Minimal chrome: location name, operation, sign out.
- No navigation to other locations (greyed or hidden per policy).
- Report problem always reachable.

### Tablet roaming (employee PIN, multi-location)

- **Locations rail** narrow — icon + name + readiness chip.
- One tap to switch location; context switches completely.

### Desktop (manager / supervisor office)

- **Full layout:** Operations Center with Locations rail + main panel + optional detail drawer.
- Today's Work may open as full page or split panel.
- Review and Administration full pages.

### Mobile (manager on floor — future-primary)

- **Operations Center as single column** — site pulse, top exceptions, location list.
- Unit Workspace simplified — next action prominent.
- No dense grids; swipe between locations.
- AI morning brief as optional first card.

**Rule:** Same information architecture across devices; **density** changes, not structure.

---

## Secondary navigation (within zones)

### Inside Operations Center

Vertical or card stack — **not tabs named after modules**:

1. Site pulse (operation + readiness)
2. Exceptions (blocked, call-downs, critical issues)
3. Location grid
4. Active operation detail
5. What's next

### Inside Unit Workspace

Single scroll or two-segment **Overview | Work** — not five module tabs.

- Overview: operation, readiness, milestones, open issues here.
- Work: ordered task list (checks, logs, confirmations).

### Inside Today's Work

Sub-areas by **decision type**, not system name:

- **Coverage** — who is where; gaps; call-downs
- **Handoffs** — cross-department commitments
- **Open issues** — site list filtered to today

### Inside Administration

Grouped by **setup lifecycle**, visited rarely:

- Site profile
- Locations and assets registry
- People and access
- Operation templates (logs, menus, schedules)
- Permissions

---

## Navigation state that persists

| State | Meaning | Set by |
|-------|---------|--------|
| **Active operation** | Which service window context applies | System clock + site schedule; manager can pin |
| **Active location** | Which Unit Workspace is focused | User selection or kiosk |
| **Active mode** | Department lens (Food Service, EVS, Plant) | User switcher |
| **Return context** | Where to go on "back" | System remembers last Center vs Work |

---

## Breadcrumb logic (conceptual)

Every drill-down shows **operation → location → detail** where applicable.

Example: *Breakfast service → 4A Servery → Failed temp check*

Back always returns one level **without losing operation context**.

---

## Navigation anti-patterns (forbidden)

- Employee lands on Operations Center.
- Manager must open three modules to answer "are we ready?"
- Locations called "Units" in employee nav without plain-language site names.
- Administration items in primary nav beside Operations Center.
- Equal weight links to Logs, Staffing, Repairs, Menus on home.
- Dead end after submitting work — no next action.

---

## Cross-industry labels

| Product zone | Industry may display |
|--------------|---------------------|
| Operations Center | Operations Center / Today / Command |
| Locations | Locations / Service points / Zones |
| Today's Work | Today / Coverage / Shift |
| Food Service mode | Dietary / Culinary / Dining |

Structure is fixed; labels configure.

---

## Related documents

- [02_OPERATIONS_CENTER_REFERENCE.md](./02_OPERATIONS_CENTER_REFERENCE.md)
- [03_UNIT_WORKSPACE_REFERENCE.md](./03_UNIT_WORKSPACE_REFERENCE.md)
- [05_EMPLOYEE_REFERENCE.md](./05_EMPLOYEE_REFERENCE.md)
- [01_NAVIGATION_SYSTEM](../reference-ux/) — experience alignment via [reference-ux/01_OPERATIONS_CENTER.md](../reference-ux/01_OPERATIONS_CENTER.md)

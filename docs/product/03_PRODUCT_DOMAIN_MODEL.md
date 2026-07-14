# 03 — Product Domain Model

**Status:** Business domain relationships (not Prisma schema)  
**Rule:** Prefer existing objects in `ltc-manager` over aspirational renames.

---

## Core entities (business meaning)

| Entity | Meaning |
|--------|---------|
| **Organization** | Parent legal/operating group; facilities belong here. Shared org alone never grants facility access. |
| **Facility** | Operational site with timezone, users, units, departments. Primary tenancy boundary for day-to-day data. |
| **UserFacilityAccess** | Explicit grant for a user to enter a facility. |
| **Department** | Operational mode / responsibility (e.g. Dietary, EVS, Plant). Lens + ownership — not a second app. |
| **Unit (Location)** | Physical/service node where work is executed (kitchen, servery, EVS zone, plant area…). |
| **User / Employee** | App identity vs frontline roster identity (PIN sessions attach to Employee). |
| **Role** | Capability ladder: Staff → Lead → Supervisor → Manager → GM → Facility Administrator. |
| **Operation** | Time-bound commitment (e.g. Lunch service) via definition + instance when Operations Engine is on. |
| **Readiness** | Computed location state for an operation: Ready / In Progress / Needs Attention. |
| **Task** | Unified work projection (optional dual-write) over logs, repairs/issues, inspections. |
| **Issue** | Disruption requiring recovery — product façade over Repair + issue type. |
| **Repair** | Persistence/history for equipment (and related) corrective/preventive work. |
| **Inspection** | Scheduled or ad-hoc verification with occurrences, submissions, findings/follow-ups. |
| **Log assignment / submission** | Compliance capture tied to unit/meal/operation rhythm. |
| **Asset** | Equipment / plant object that can fail or need PM. |
| **Knowledge article** | Facility-scoped SOP/reference publishable into work context. |
| **Schedule / Override / Call-down** | Who is supposed to be where; intentional coverage change. |
| **WorkspacePreference** | Per-user, per-facility Workspace layout prefs. |

---

## Relationship diagram (business)

```text
Organization
  └── Facility ───────────────────────────────┐
        ├── User ◄── UserFacilityAccess       │
        ├── Employee                          │
        ├── Department ◄── (mode lens)        │
        ├── Unit (Location)                   │
        │     ├── Log assignments/submissions │
        │     ├── Issues / Repairs ── Asset   │
        │     ├── Inspection scope            │
        │     └── Readiness (computed)        │
        ├── OperationDefinition/Instance      │
        ├── Knowledge                         │
        ├── Inspection definitions/occurrences│
        └── WorkspacePreference (User×Facility)
```

```text
Operation (instance)
  ├── scopes expectations (logs, staffing, meal events)
  ├── feeds Operations Center / Workspace headers
  └── evaluated with Readiness rules per Unit × Department profile
```

```text
Disruption path
  Signal (failed log, OOS asset, staffing gap…)
    → Readiness Needs Attention / Issue open
    → Today's Walk / OC exception / Workspace Focus
    → Unit Workspace or Issue detail execution
    → Knowledge / Recovery assistant (optional)
    → Verification (close issue, complete inspection, restore Ready)
```

---

## Ownership of truth

| Concern | Authoritative owner |
|---------|---------------------|
| Is this location supportable **now**? | Readiness (department profile) |
| What is the active meal/service window? | Operations Engine (when enabled) else meal/servery heuristics |
| What failed for the site? | Operations Center composition |
| Where should the supervisor walk? | Today's Work walk/coverage |
| What should **I** do next (manager)? | Business Workspace Manager Focus |
| What do I do **at this unit**? | Unit Workspace work queue |
| Issue lifecycle | Issue / Repair module |
| Inspection schedule state | Inspection occurrences / submissions |

Homes **must not** invent alternate truth for the rows above.

---

## Naming notes (domain vs code)

| Preferred product term | Common code/legacy term |
|------------------------|-------------------------|
| Location | `Unit` |
| Needs Attention | internal `blocked` |
| Issue | `Repair` table + `/repairs` routes still present |
| Operations Center | `/dashboard` path |
| Facility | sometimes called “Site” in older vision docs |

Constitution prefers **product terms** in UI and docs; schema renames are optional later.

---

## Inconsistencies to track

1. **Site vs Facility** — vision docs say Site; shipped model is Facility. Prefer Facility until a deliberate rename.  
2. **Issue vs Repair** — dual language remains; destination URLs still mixed.  
3. **Operation engine flag-off** — domain concept exists; some surfaces still use meal-heuristic context.  
4. **Task optional** — Work capability exists without Task rows when sync is disabled.

# 02 — Section Model

## Decision

A **Section** is a named, ordered band of an Experience shell with one operational purpose. Sections are the primary unit of home density adaptation.

---

## Canonical section catalog

| Section key | Purpose | Owner (declaration) | Source of content | Consumers | Required? |
|-------------|---------|---------------------|-------------------|-----------|-----------|
| `HEADER` | Identity, area, primary actions | Catalog | Identity + action contracts | All homes | **Required** |
| `OVERVIEW` | What this Experience is / why it matters now | Catalog | Static copy + light overlay | All denser homes | **Required** |
| `CURRENT_STATUS` | Live operational state | Catalog | Readiness / due / blockers overlay | Unit, OC, Today, BW | Conditionally required |
| `TODAYS_WORK` / `OUTSTANDING_WORK` | What must be done | Catalog | Tasks, incomplete logs, issues | Unit, Today, BW | Optional |
| `EQUIPMENT` / `RESOURCES` | Related physical resources | Catalog | Assets/equipment scoped | Unit | Optional |
| `TASKS` | Assignable work items | Catalog | Work Engine / assignments | Unit, Today | Optional |
| `LOGS` | Recurring capture (tool host) | Catalog + tool binding | LOGS tool + submissions | Unit | Optional |
| `FORMS` | Structured capture (tool host) | Catalog + binding | FORMS tool | Unit | Optional |
| `KNOWLEDGE` | Contextual guidance | Catalog + binding | KNOWLEDGE tool | Unit, Recovery | Optional |
| `HISTORY` | Recent events/submissions | Catalog | Domain history queries | Unit | Optional |
| `METRICS` | Experience-scoped KPIs | Catalog | Analytics contract + facts | BW, Admin, Unit | Optional |
| `REPORTS` | Bounded reporting views | Catalog | Report tool/views | Unit, Review links | Optional |
| `DOCUMENTS` | Attachments / records | Catalog | Records/documents | Unit | Optional |
| `AI` | Grounded assist | Catalog AI contract | Intelligence + scopes | Unit, OC moments | Optional |
| `SETTINGS` | Config deep link | Catalog | Profile/admin routes | Entitled only | Optional |
| `NOTIFICATIONS_INBOX` | — | — | — | — | **Forbidden** in shell |

Section keys are **registry-governed**. Experiences select from the catalog; they do not invent unbounded free-text section IDs for core chrome. Extension adds keys via platform registry update (`12`).

---

## Rendering rules

1. Render only sections declared on the Experience **and** allowed by the home density profile.  
2. Suppress optional sections with zero cards after overlay (empty).  
3. Preserve **Experience-declared order** within a density; homes may *drop* sections, not reorder meaning arbitrarily.  
4. Tool sections (`LOGS`, `KNOWLEDGE`, …) render only if tool binding is active.  
5. `SETTINGS` never on PIN floor paths unless explicitly entitled.  
6. `AI` never invents work; omit if contract absent or Projection AI context failed.

---

## Ordering rules

Default order (full density):

```text
HEADER
OVERVIEW
CURRENT_STATUS
OUTSTANDING_WORK / TODAYS_WORK
RESOURCES / EQUIPMENT
TASKS
LOGS / FORMS / CHECKLISTS
KNOWLEDGE
AI
HISTORY
METRICS / REPORTS / DOCUMENTS
SETTINGS
```

Experiences may omit and lightly retune order for product meaning (e.g., Logs before Equipment) via declaration — not via home code.

---

## Section vs Card

- Section = purpose band + layout region mapping.  
- Card = interactive content unit inside the section.  
A section without cards (and no tool host) should not render.

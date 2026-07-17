# 10 — Experience ↔ Engine Boundary

## Decision

**Experience = product face of work.**  
**Engine = system of record / live evaluation substrate.**

Experiences never duplicate engine truth. Engines never decide which Experiences a department runs.

---

## Boundary diagram

```text
Temperature Monitoring (Experience)
  ├── contracts: workspace, query scope, readiness keys, AI, tools
  ├── LOGS tool binding → temperature templates
  └── reads/writes through scopes
           ↓
Temperature / Log submission engine (domain)
  ├── LogTemplate, LogSubmission lifecycle
  ├── due/completion evaluation helpers
  └── Task dual-write adapter (optional Work Engine)

Readiness engine
  └── consumes declared signal keys for projected rooms

Operations Engine
  └── provides current commitment window (“now”)

Work Engine
  └── optional Task projections of submissions / follow-ups
```

---

## Separation table

| Concern | Experience | Engine |
|---------|------------|--------|
| “Dietary does temp monitoring in Serveries” | Profile + Projection | — |
| “Is this log overdue?” | Displays status | Computes from submissions + schedules |
| “Create submission” | Action + tool UI | Persists + validates |
| “Ready / Needs Attention” | Declares signal contribution | Evaluates aggregate state |
| “Breakfast is active” | May gate UI relevance | Owns OperationInstance |
| “SOP for calibration” | Knowledge tool section | Knowledge store |

---

## Engine families Experiences may use

- Operations Engine  
- Readiness  
- Work Engine / Tasks  
- Log / Form submission domains  
- Issues / Repairs  
- Assets / PM schedules  
- Inspections  
- Assignments / staffing  
- Knowledge store  
- Intelligence (AI moments) — assistive, not SoR  

One Experience may use multiple engines. One engine may serve many Experiences (LOGS engine serves Temperature Monitoring and Cleaning).

---

## Forbidden crossings

- Experience persists its own shadow copy of readiness.
- Engine enables Meal Service because Unit type is Servery.
- Home bypasses Experience and talks to engines with department `if` trees for eligibility.
- Projection writes engine records.

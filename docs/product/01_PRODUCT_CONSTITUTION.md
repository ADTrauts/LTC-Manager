# 01 — Product Constitution

**Status:** Governing product document (post–Wave 12)  
**Mode:** Architecture / product definition — not implementation  
**Supersedes for “what we are now”:** earlier planning notes that treat Organization, Task, Business Workspace, or AI Moments as absent  
**Companion vision (pre-implementation intent):** `docs/platform-vision/` at the monorepo root  

---

## Purpose of this constitution

LTC Manager has completed twelve modernization waves. The codebase is large enough that **feature imagination outruns shared definition**.

This constitution answers:

> **What is LTC Manager?**

It does **not** answer “what should we code next” in isolation. Coding decisions must pass through this document, the capability model, and the decision model.

---

## Mission

**Help frontline teams run complex physical operations — starting with dietary/food service — by making “how is today going?” answerable in seconds, and making recovery possible without leaving the floor.**

We replace spreadsheet-and-radio coordination with **operational awareness at the point of service**: coverage, readiness, logs, issues, inspections, and knowledge bound to the place and moment of work.

---

## Vision

LTC Manager becomes the **operations home for multi-node service environments**: many locations, many shifts, multiple departments (Dietary, EVS, Plant, and future modes), across long-term care and adjacent dining/hospitality environments.

Long-term:

- The product remains **facility-operational**, not clinical.
- **Organization** is the parent for multi-facility access — not a second product.
- **Intelligence** intensifies moments already owned by Operations / Work / Knowledge — it does not become a chatbot home.
- **Industry configuration** (neutral copy, packs, data-driven modes) completes the platform language — without forking the product tree per industry.

---

## Product principles

### 1. Operations before documentation

Documentation is a **byproduct of doing work**, not a separate career path inside the app.

### 2. Software where work happens

Tablet- and unit-first execution (PIN, kiosk, Unit Workspace) outranks laptop-only admin UX.

### 3. Role- and location-scoped clarity

People see what they need for **this role, this facility, this department lens, this place, this operation** — not the entire ERP surface.

### 4. Awareness before analytics

“What needs me now?” beats historical warehouses, vanity KPIs, and scorecards as the primary experience.

### 5. Knowledge attached to work

SOPs and guidance live on the unit, issue, template, or asset — not as a detached intranet.

### 6. Resilience under disruption

Issues, readiness, call-downs, and recovery assistants exist so the day can continue when something breaks.

### 7. Engines serve homes — homes do not duplicate engines

Operations Engine, Work Engine, and Readiness are **substrate**. Business Workspace, Operations Center, Today's Work, and Unit Workspace are **homes**. Homes compose engines; they do not re-implement domain rules.

---

## Non-negotiable values

| Value | Meaning in product |
|-------|-------------------|
| **Facility safety of data** | Active facility scopes queries; facility switch must not leave stale prior-facility content. |
| **Role honesty** | Preferences and AI cannot unlock what RBAC denies. |
| **Deterministic operational truth** | Readiness, Focus, and agenda never invent urgency or fake due times. |
| **Authoritative sources** | Summaries link to the module that owns the work (issue, unit, coverage, OC). |
| **Forward-only schema discipline** | Migrations do not rewrite history; dual-write and flags protect floor flows. |
| **AI as grounded moments** | Briefs and assistants are opt-in, facility-scoped, cacheable, provider-gated — never a Workspace generation console. |

---

## What belongs in LTC Manager

- Facility-day operational readiness and exception awareness  
- Location / unit execution (logs, meal rhythm, issues, inspections)  
- Supervisor walk, coverage, call-downs, handoffs  
- Manager daily home (Business Workspace) composing those signals  
- Department operational modes (Dietary, EVS, Plant…)  
- Assets / vendors as operational equipment context  
- Employee roster and operational HR **adjacent to staffing** (not a full HRIS replacement)  
- Knowledge bound to work  
- Organization parent + explicit multi-facility access  
- Design system and navigation zones that enforce the above  

---

## What does not belong

See also [07_PRODUCT_BOUNDARIES.md](./07_PRODUCT_BOUNDARIES.md).

We do **not** become:

- An EHR / EMR / clinical documentation system  
- Payroll or full HRIS  
- General ledger / accounting ERP  
- Messaging-first collaboration suite  
- Inventory accounting / warehouse WMS  
- Generic project-management / ticket SaaS divorced from operations  
- Analytics-as-home (BI warehouse first UX)  

**Integrations later; ownership never by default.**

---

## Decision hierarchy

When conflict arises, prefer — in order:

1. **Floor operability** (can staff finish the meal / round safely?)  
2. **Facility data integrity** (correct facility, department, timezone)  
3. **Role clarity** (right person sees right surface)  
4. **Canonical terminology** (see Language Guide)  
5. **Home composition** (Workspace / OC / Today / Unit keep distinct jobs)  
6. **Engine purity** (do not copy readiness/issue rules into a second home)  
7. **Feature richness**  

No feature may violate (1)–(3) to satisfy (7).

---

## Product philosophy

LTC Manager is an **operational platform**, not a module menu.

The story of a day:

```
Operation (time-bound commitment)
  → Work (tasks / logs / issues / inspections)
  → Execution (Unit Workspace)
  → Verification (readiness, findings, compliance completion)
  → Knowledge (SOPs at the moment of need)
  → Improvement (handoffs, briefs, recovery — never vanity dashboards)
```

Managers begin in **Business Workspace**.  
Supervisors begin in **Today's Work**.  
Floor staff begin in **Unit Workspace** (or logs if no unit locked).  
**Operations Center** remains the site exception glance — not a second home for everyone.

---

## Long-term direction

1. Finish **platform language** (industry/neutral configuration) without scattering “Wave 12” meaning.  
2. Deepen **multi-facility** safely (access already explicit; rollups later).  
3. Grow **adjacent departments** through readiness profiles and mode lenses — not forked apps.  
4. Keep **AI** as moments on OC / Today / Issues / cached Workspace peek.  
5. Add **supply / communications / inventory** only as **operational signals**, never as accounting systems of record.

---

## Governance

- Changing this constitution requires an explicit product decision (documented ADR or constitution revision).  
- Implementation waves cite which constitution clauses they serve.  
- Ambiguous feature placement uses [09_PRODUCT_DECISION_MODEL.md](./09_PRODUCT_DECISION_MODEL.md).

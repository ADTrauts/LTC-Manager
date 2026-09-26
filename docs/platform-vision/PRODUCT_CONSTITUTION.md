# Product Constitution

> **Retired (2026-09-25):** Operation entity, Experience catalogs, and industry packs are not current product direction. Principles below still hold. Live contract: [RETIRED.md](./RETIRED.md) and [../department-administration/13_LOCATION_PROGRAMMING_REALIGNMENT.md](../department-administration/13_LOCATION_PROGRAMMING_REALIGNMENT.md).

**Status:** Planning document — historical principles  
**Source of truth for current state:** [docs/architecture-review/](../architecture-review/)  
**Date:** 2026-07-07

This document defines the **mission and non-negotiable principles** for the operations platform evolving from the LTC Manager codebase. It is a planning artifact — not implemented product behavior.

---

## Mission

**Help frontline teams run complex physical operations — starting with food service — by meeting them where work happens, with software that makes the day visible, actionable, and recoverable.**

The platform exists to replace spreadsheet-and-radio coordination with **operational awareness at the point of service**: who is covering what, whether each location is ready, what must be logged, what broke, and what is running low — without forcing staff to leave the floor to "do documentation."

We build for **multi-node environments** (many service points, many shifts, many departments) across **healthcare, education, and corporate dining** — not only long-term care.

---

## Product principles

### 1. Operations before documentation

**Documentation is a byproduct of doing work, not a separate job.**

- Capture happens **during** meal service, rounds, and repairs — not after shift in a back office.
- Forms, checklists, and timestamps attach to **real operational moments** (meal ready, zone cleaned, equipment down).
- Compliance records must be **fast to complete on a tablet**, not optimized for auditors first.
- Reports and exports serve supervision and improvement; they do not drive the primary UX.

**Implication for the platform:** The default experience is **execution surfaces** (unit boards, shift rhythm, quick entry) — not report builders or admin configuration.

---

### 2. Software where work happens

**The app belongs on the floor, at the servery, in the zone — not only on a manager's laptop.**

- Tablet-first interaction: large targets, PIN login, unit-locked kiosks.
- Navigation follows **where people are standing**, not org-chart abstractions.
- Deep links and active context (current unit, current meal period, today's date) are first-class.
- Managers configure structure; **staff live in unit and shift context**.

**Implication for the platform:** Location/unit context is always one tap away; global admin is secondary to daily operational surfaces.

---

### 3. Role- and location-scoped UX

**People see what they need for their job, at their place, at this time — nothing more.**

- **Role** controls capability (submit log vs assign schedule vs change permissions).
- **Location (unit)** controls what is in front of them (this servery's menu, logs, readiness).
- **Department / operational mode** controls which modules appear (dietary vs EVS vs plant).
- Scoped sessions are normal: a PIN user on Unit 4A should not wade through enterprise settings.

**Implication for the platform:** Every screen answers: *Who is viewing this? Where are they? What mode are they in?*

---

### 4. Operational awareness

**The platform's core value is making "how is today going?" answerable in seconds.**

- Dashboards show **status and exceptions**, not vanity metrics.
- Signals combine staffing coverage, log completion, meal rhythm, open issues, and readiness.
- Supervisors scan for **red / yellow / green** — then drill into the unit or person.
- Awareness is **time-bound** (today, this meal, this shift) before it is historical.

**Implication for the platform:** Global and unit views prioritize **now and next** over archival analytics in the primary workflow.

---

### 5. Knowledge attached to work

**Procedures, context, and history live on the thing being worked — not in a separate wiki.**

- Checklists carry instructions; issues carry updates; assets carry repair history.
- Attachments and notes bind to **submissions, work orders, and separations** — not floating files.
- Handbook and policy references link from the **discipline or compliance moment** that needs them.
- Search and filters replace "home pages of hyperlinks."

**Implication for the platform:** Prefer **contextual knowledge** (on the log, on the issue, on the unit) over a generic document repository.

---

### 6. Resilience during disruption

**Operations do not stop when the plan breaks — software must support recovery, not punish variance.**

- Day-of overrides (reassignments, call-downs, reroutes) are first-class, with reason captured.
- Missed or failed work is **visible**, not hidden — so coverage can be retried.
- Equipment down, short staff, and isolation events should **surface** on boards managers already watch.
- PIN login on the "wrong" unit still allows work, with **warning and audit** — blocking is reserved for permissions, not honest floor reality.

**Implication for the platform:** Model **exceptions, overrides, and open loops** as prominently as the happy path.

---

### 7. Industry-aware, not industry-locked

**The platform speaks the language of physical operations — not one vertical's acronym soup.**

- **Site** (facility, campus, hospital, school district building) — configurable display, not hardcoded "LTC."
- **Location / unit** — serveries, dining halls, zones, closets; types are extensible.
- **Department** — dietary, EVS, plant, housekeeping; seeded per vertical, not baked into code paths.
- **Compliance** — templates and fields adapt to jurisdiction and operator policy; avoid NYS-only assumptions in core models (industry packs may add them).
- **HR depth** — union discipline and background checks are **modules**, not the platform definition.

**Implication for the platform:** Core nouns are **operation, location, task, log, issue, supply** — industry packs layer terminology and presets on top.

---

## What we optimize for

| Optimize for | Deprioritize |
|--------------|--------------|
| Floor speed and clarity | Back-office report design |
| Exception visibility | Perfect plan adherence |
| Configurable structure per site | One-size facility layout |
| Multi-node service (many units) | Single dining room only |
| Operator repeatability (contract dining) | Single-customer custom builds |
| Incremental module expansion | Big-bang "suite" launches |

---

## What we are not

- **Not an EMR, student information system, or ERP.**
- **Not payroll, clinical documentation, or inventory ERP replacement** (though we may track supplies at operational PAR level).
- **Not a generic project-management tool** — tasks tie to physical operations and compliance rhythm.
- **Not industry-locked LTC software** — LTC is the first beachhead, not the ceiling.

---

## Relationship to the existing codebase

The current LTC Manager repository **already embodies several principles**:

- Unit-driven sidebar and dashboards (**software where work happens**)
- PIN + kiosk unit lock (**floor-first**)
- Log submission at point of service (**operations before documentation**)
- Department-scoped nav and role matrix (**role/location scoped UX**)
- Global dashboard exception cards (**operational awareness**)
- Assignment overrides and kiosk warnings (**resilience during disruption**)

Gaps against this constitution — generic **tasks**, **supplies**, **call-downs**, **organization/multi-site**, and **industry-neutral language** — are addressed in companion planning documents, not in this constitution alone.

---

## Governance

- This constitution changes **rarely** and only with explicit product leadership agreement.
- Feature specs and architecture decisions must **not contradict** these principles without amending this document.
- [ARCHITECTURE_DECISION_LOG.md](./ARCHITECTURE_DECISION_LOG.md) records consequential technical choices.
- [CURRENT_STATE_VS_TARGET_STATE.md](./CURRENT_STATE_VS_TARGET_STATE.md) tracks gap closure over time.

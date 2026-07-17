# 01 — Experience Constitution

## Purpose

This constitution establishes **Experience** as the primary operational building block of LTC Manager.

Everything operational ultimately exists **inside** an Experience — or as a tool, contract contribution, or engine record *serving* an Experience.

Modules, top-level “Logs,” and capability checkboxes are not the long-term product vocabulary.

---

## Constitutional definition

> **An Experience is a stable, named unit of operational work that a person would say they are going to do — configurable by a department, delivered by Projection, composed into homes, and backed by engines for live truth.**

An Experience answers:

```text
What work does this department do here?
```

Not:

```text
What database table is this?
What route is this?
What React page is this?
```

---

## The Experience test

Ask: *Would a worker say they are going to go do this?*

| Statement | Classification |
|-----------|----------------|
| “I’m going to do Meal Service.” | **Experience** |
| “I’m going to do Temperature Monitoring.” | **Experience** |
| “I’m going to enter the temperature log.” | **Tool** inside Temperature Monitoring |
| “I’m going to open Knowledge.” | **Tool** (contextual) |
| “I’m going to check the Operations Center.” | **Home** (aggregates Experiences) |
| “I’m going to the Food Safety area.” | **Operational Area** (organizes Experiences) |

---

## What an Experience is NOT

| Concept | Difference |
|---------|------------|
| **Module** | Engineering package / historic nav peer (Logs, Assets). Retired as product organization. |
| **Feature** | Ship unit or flag. An Experience may ship via features; a feature is not an Experience. |
| **Tool** | Instrument (Logs, Forms, Knowledge, Tasks, Records, Checklists). Lives *inside* Experiences. |
| **Workspace / Home** | Composition surface (Business Workspace, Unit Workspace, OC, Today). Homes mount Experiences; they are not Experiences. |
| **Dashboard** | Aggregate glance pattern (often OC). Aggregates Experience signals; not an Experience. |
| **Page / Route** | Rendering destination. One Experience may contribute to many routes; one route may host many Experiences. |
| **Engine** | Live-truth substrate (Readiness, Operations, Work, Log submissions, Issues). Engines serve Experiences. |
| **Operational Area** | Department-owned *grouping* of Experiences (Service, Food Safety). Areas organize; Experiences are the work. |
| **Capability** | Legacy grant string. Superseded as product truth by Experience activation. |
| **Domain object** | Record (asset, issue, submission). Experiences *use* domain objects; they do not replace them. |

---

## Platform ownership (constitutional stack)

```text
┌──────────────────────────────────────────────────────────────┐
│ FACILITY BUILDER         physical truth + room assignment      │
│   Knows nothing about Experiences.                             │
├──────────────────────────────────────────────────────────────┤
│ EXPERIENCE CATALOG       what Experiences exist (platform)     │
│   Identity, contracts, default tools, eligible departments.    │
├──────────────────────────────────────────────────────────────┤
│ DEPARTMENT ADMINISTRATION  how this facility's dept uses them  │
│   Select → place in Areas → archetype tune → activate Profile. │
├──────────────────────────────────────────────────────────────┤
│ EXPERIENCE RUNTIME       how an Experience behaves when live   │
│   Anatomy, contracts, composition, tools, AI/analytics hooks.  │
│   ← this constitution                                          │
├──────────────────────────────────────────────────────────────┤
│ PROJECTION               which Experiences appear where/whom   │
│   Emits Areas → Experiences → contract descriptors.            │
├──────────────────────────────────────────────────────────────┤
│ HOMES                    compose projected Experiences         │
│   Workspace / OC / Today / Unit — purpose-shaped mounting.     │
├──────────────────────────────────────────────────────────────┤
│ OPERATIONAL ENGINES      live truth inside Experience scopes   │
└──────────────────────────────────────────────────────────────┘
```

---

## Invariants

1. **Experiences are the operational vocabulary.** New operational capability = new or extended Experience in the catalog — not a new module zone.
2. **Tools never navigate as peers of Experiences.** Logs/Knowledge/Forms appear in context.
3. **One catalog identity** (`experienceKey`); facilities never invent executable IDs.
4. **Profile selects and configures; catalog defines.** Department Administration cannot redefine what Meal Service *is* — only whether/how it runs here.
5. **Projection delivers contract descriptors**, not pages or modules.
6. **Homes compose; Experiences declare.** Composition order inside an Experience is Experience-owned (see `05`).
7. **Engines own live truth.** Experiences never become a second system of record.
8. **Permissions attach to actions within Experiences**, not to “module routes” as the long-term model.
9. **AI and analytics attach to Experiences** (with rollups upward), not to orphan dashboards.
10. **Adding an Experience must not require Facility Builder or Projection core changes** when contracts are honored (`13`).

---

## Manager mental model

> “My department has Areas of responsibility. Inside each Area are Experiences — the real work. Tools show up where that work needs them.”

---

## Engineering mental model

```text
Catalog definition
  → Profile activation
    → Projection (presence + scopes + contract handles)
      → Home mounts Experience shell
        → Tools + engines supply live content
```

---

## Supersession

This constitution **elevates** Experience from “catalog entry + projected descriptor” to **runtime building block**. It does not replace Department Administration or Projection constitutions — it completes the middle of the stack they already assumed.

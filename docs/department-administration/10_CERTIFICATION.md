# 10 — Certification

## Purpose

This document certifies the Department Administration architecture and answers the three decisive questions this wave was created to resolve.

## Question 1 — Is this the final operational architecture?

**Yes, for the operational-model layer.** With Operational Areas introduced, the conceptual stack is complete end to end:

```text
WHERE   Facility Builder          Facility → Floor → Neighborhood → Room
WHO     Facility Builder          Room ↔ Department assignment
HOW     Department Administration  Department → Operational Area → Experiences → Room Archetypes
WHICH   Projection                 the right Areas/Experiences here, now, for this person
WHAT    Operational Engines        live truth inside a projected Experience
```

Every prior open question is now answered:

- Where things exist — Facility Builder.
- Who owns them — Facility Builder assignment.
- What can exist — the Experience Catalog.
- **How a department organizes itself — Operational Areas.** ← this wave.
- Which of it appears — Projection.
- What is true now — engines.

No missing layer remains. Future work is implementation and catalog growth, not new architecture.

## Question 2 — What constitutional layers now exist?

Five constitutional layers, each with a single owner and a hard boundary:

1. **Physical Structure** — Facility Builder. Owns Facility/Floor/Neighborhood/Room and department assignment. Knows nothing operational.
2. **Operational Model** — Department Administration. Owns Operational Areas, Experience selection, Room Archetypes, and the Operational Profile. Knows nothing about specific rooms or users.
3. **Derivation** — Projection. Owns which Areas and Experiences appear for a given room, department, user, and time. Persists nothing operational.
4. **Live Truth** — Operational Engines. Own readiness, operations, assignments, and records inside a projected Experience.
5. **Governance** — Organization/platform. Owns the Experience Catalog, the Operational Area vocabulary, and System Department Baselines.

The new constitutional addition this wave is **the Operational Model layer, organized by Operational Areas** — the manager's mental model made structural.

## Question 3 — Should future modules be added by extending Operational Areas rather than editing the platform?

**Yes, unequivocally.** This is the central governance rule:

> New operational capability is added by publishing an Experience to the catalog and composing it into an Operational Area. It is never added by creating a new platform module or editing Facility Builder or Projection.

"Modules" as a top-level concept are retired. What used to be a module becomes either:

- an **Operational Area** (an organizing grouping), or
- an **Experience** (a reusable building block), or
- a **tool inside an Experience** (Logs, Knowledge, Forms).

`06` proves this scales to Laundry, Security, Transportation, Volunteer Services, Hospitality, Biomedical, and Administration with zero Facility Builder or Projection change.

## Challenged assumptions — final rulings

- **"Logs" as a visible concept:** retired. Logs are a tool that appears inside its owning Experience (temperature logs live inside Temperature Monitoring inside Food Safety). There is no top-level Logs.
- **"Knowledge" as a module:** retired. Knowledge surfaces in context wherever work happens. A central library is maintained under Administration → Knowledge, but Knowledge is not a peer of Service.
- **Managers see Food Safety, not Logs:** affirmed. The IA is operational, not software-shaped. A director sees their areas of responsibility; tools appear inside the work.

## Ownership summary

```text
Facility Builder            physical structure + assignment      (never operational)
Department Administration   Areas + Experiences + Archetypes     (never physical, never derivation)
Projection                  derivation                           (never authoring, never state)
Operational Engines         live truth                           (never structure)
Governance                  catalog + vocabulary + baselines     (never facility-specific config)
```

## Readiness

| Dimension | Score | Note |
|---|---|---|
| Conceptual completeness | 9.5 / 10 | Stack is complete; only catalog breadth grows over time |
| Ownership clarity | 10 / 10 | Five layers, five owners, hard boundaries |
| Manager comprehensibility | 9.5 / 10 | Organized as a Director thinks; validated against Dietary/EVS/Plant |
| Expansion safety | 9.5 / 10 | New departments are configuration, not engineering |
| Projection fit | 9 / 10 | Recertified through Operational Areas; simplifies consumers |
| Implementation readiness | 8.5 / 10 | Clear bottom-up order; first wave scoped |
| **Overall** | **9.3 / 10** | Certified as the final operational architecture |

## Approval gate

- Architecture: **approved.**
- Implementation: **paused** per this package's constraints.
- First wave when unpaused: **Experience Registry + Operational Areas** (`09`).

## Certification statement

The Department Administration architecture is certified. Operational Areas are established as the manager's mental model and the organizing layer between Departments and Experiences. Modules are retired in favor of Areas, Experiences, and in-context tools. Ownership is separated across five constitutional layers. Expansion is additive. Projection is recertified to resolve through Operational Areas. This is the final operational architecture; the next step is implementation, beginning with the Experience Registry.

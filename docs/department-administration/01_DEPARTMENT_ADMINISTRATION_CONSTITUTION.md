# 01 — Department Administration Constitution

## Purpose

Department Administration is the layer where a department defines **how it operates**. It is the operational constitution of a department: the durable statement of what work the department does, how that work is organized, and how it behaves across different kinds of rooms.

It is not a screen. It is not a table. It is a **layer of ownership** with hard boundaries against the layers above and below it.

## What Department Administration is

Department Administration is the authoring surface for a department's operational model. A Director uses it to answer, once and durably:

- What are the major areas of work in my department?
- What operational Experiences live inside each area?
- How does my department behave differently in a Servery versus a Resident Room versus a Storage room?
- What is the standard model that every facility of this department inherits, and what may a single facility adjust?

The output of Department Administration is a certified **Operational Profile** — the bound, active configuration a facility's department runs on.

## What Department Administration owns

Department Administration owns the department's operational model:

1. **Operational Areas** — the department's organizing structure (Service, Food Safety, Equipment, People, Documentation, Production, Quality). This is the manager's mental model.
2. **Experience selection and arrangement** — which Experiences from the catalog are active, and which Operational Area each one belongs to.
3. **Department Room Archetypes** — how the department operates in a *type* of room (Servery, Resident Room, Kitchen), independent of the physical room record.
4. **Operational defaults and policy** — the standard behavior inherited by every facility, plus the narrow set of adjustments a facility may make.
5. **The Operational Profile lifecycle** — draft, certify, activate, version.

## What Department Administration must never own

Department Administration must never reach across a boundary it does not own:

- **It does not own physical structure.** It never creates, edits, moves, or deletes a Facility, Floor, Neighborhood, or Room. That is Facility Builder.
- **It does not own room-to-department assignment.** Whether a room belongs to Dietary is Facility Builder's decision. Department Administration only describes how Dietary behaves *in the rooms it was given*.
- **It does not own derivation.** It never decides that an Experience appears in a specific room for a specific user. That is Projection.
- **It does not own live operational truth.** It never stores whether today's trays were accurate or whether a work order is open. Those are Operational Engines.
- **It does not own routes, UI, or schema.** It is a product model. Implementation is downstream and out of scope.

## The four-layer separation

```text
┌─────────────────────────────────────────────────────────────┐
│ FACILITY BUILDER            owns physical truth               │
│   Facility → Floor → Neighborhood → Room                      │
│   Room ↔ Department assignment                                │
│   Knows nothing about Experiences, Areas, or modules.         │
├─────────────────────────────────────────────────────────────┤
│ DEPARTMENT ADMINISTRATION   owns the operational model        │
│   Operational Areas, Experiences, Room Archetypes             │
│   Produces one certified Operational Profile per facility dept│
│   Knows nothing about specific rooms or specific users.       │
├─────────────────────────────────────────────────────────────┤
│ PROJECTION                  owns derivation                   │
│   For this room, this department, this user, right now:       │
│   which Areas and Experiences are visible and actionable.     │
│   Reads the profile. Persists nothing operational.            │
├─────────────────────────────────────────────────────────────┤
│ OPERATIONAL ENGINES         own live truth                    │
│   readiness, operations, assignments, records, work           │
│   Answer "what is true right now" inside a projected Experience│
└─────────────────────────────────────────────────────────────┘
```

### Why the boundaries are strict

Each boundary prevents a specific failure:

- **Facility Builder ↔ Department Administration** prevents Facility Builder from becoming module-aware. A person building floors and rooms must never see or select operational Experiences. The moment they do, physical structure and operating model are fused and can no longer evolve independently.
- **Department Administration ↔ Projection** prevents the operational model from hard-coding placement. The department says "Dietary does Meal Service in Servery archetypes." Projection decides that Room 214, which is a Servery, therefore shows Meal Service to this user today.
- **Projection ↔ Operational Engines** prevents derivation from owning state. Projection says the Experience is present; the engine says what is currently true inside it.

## Authority rules

1. **A department may only operate in rooms Facility Builder assigned to it.** Department Administration cannot claim rooms.
2. **The Operational Profile is the single source of a department's model.** Nothing downstream infers operational structure from anywhere else.
3. **The system baseline defines the standard; the facility profile adjusts within allowed bounds.** A facility cannot invent Experiences that the department has not published.
4. **Certification is required before activation.** An uncertified profile is a draft and never drives Projection.

## Constitutional guarantee

Department Administration guarantees that **the way a Director describes their department is the way the system organizes it.** If a Dietary Director thinks in Service, Food Safety, and Equipment, the system's structure is Service, Food Safety, and Equipment — not Logs, Forms, and Records.

# 05 — Operational Philosophy

**Status — CURRENT.** This describes the operating loop and its design principles.

---

## The operating loop

```text
Operational Cycle   Which recurring window is active?
        ↓
Owner configuration What applies at this place and time?
        ↓
Execution           Do it at the place
        ↓
History / Audit     What was expected that service date, and what was recorded?
```

This loop is **time-bound** (facility timezone, service date) and **place-bound** (the physical room).

An **Operational Cycle** is the Department’s recurring window. A **Phase** is one interval inside it. A **Key Point** is an instant on it, with occurrence tracking NONE, OPTIONAL, or REQUIRED. Current cycles are derived. Cycles may overlap and may cross midnight. Phases may overlap and may leave gaps. Key Points are not Work.

Build authors configuration through each owner. Run reads what is effective now. Audit reads the configuration effective on the requested service date. Each engine explicitly determines participation within canonical Department responsibility.

Dietary timing actuals are `OperationalCycleKeyPointActual`. Meal Due tracks NONE. Ready and Service Started track REQUIRED at LOCATION grain. Facility Plant Operations has zero required starter Operational Cycles and is not forced through a meal rhythm. Preventive Maintenance is not an Operational Cycle. A missing published Cycle supplies no current window. See [14 — Facility Plant Operations](./14_FACILITY_PLANT_OPERATIONS.md).

---

## How the pieces interact

### Operational Cycle

The current window is a published Operational Cycle, not a separate meal-milestone engine. Surfaces that need “now” read that published rhythm.

### Execution

Workforce Assignments own daily employee placement and instructions. Records own evidence requirements and submitted facts. Maintenance uses Work Orders and PM. Job Flow composes the applicable authorized facts.

### Readiness

Answers: **Can this location support the current commitment?**  
States: **Ready / In Progress / Needs Attention** (internal code may still say `blocked`).  
The effective Cycle, Record requirements, Coverage and other owners supply the relevant signals. An incomplete future requirement creates no current exception.

### Issues, repairs, and Records

- **Issue** — disruption requiring recovery.  
- **Repair** — equipment work-order persistence already in the platform.  
- **Inspection** — a Record form, not a second engine.  

### Homes

| Surface | Question it answers |
|---------|---------------------|
| Dashboard | What needs attention now in my authorized scope? |
| Job Flow | What should I do in my current assignment or place? |
| Unit Workspace | What do I do **standing here**? |
| Audit / Reports | What was expected, and what was recorded, for this service date? |

If a design makes two homes answer the same question the same way, **one home is wrong**.

### AI design principle

For future assistive summaries, compose the owner of the relevant moment:

- Morning Brief → Dashboard peek when cached  
- Shift transition → the authorized Dashboard or shift context
- Recovery Assistant → Issue detail  

AI must not become the operational system of record and must not invent due times.

### Knowledge

Closes the improvement loop by putting SOPs at submission, unit, and issue contexts — reducing training load without creating a second wiki product.

---

## Design implications

1. New features attach to a stage in the loop (or they are out of bounds).  
2. Summaries always deep-link to Execution or Verification owners.  
3. Preferences and AI create no operational facts or obligations.
4. Multi-facility means **restarting the loop** for the destination facility — never blending loops.

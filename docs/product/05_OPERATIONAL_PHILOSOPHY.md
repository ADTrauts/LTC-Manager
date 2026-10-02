# 05 — Operational Philosophy

**Status:** How day-of operations should work in Vssyl  

---

## The operating loop

```text
Operational Cycle   Which recurring window is active?
        ↓
Work and Records    What does that window require, at which Location Functions?
        ↓
Execution           Do it at the place
        ↓
History / Audit     What was expected that service date, and what was recorded?
```

This loop is **time-bound** (facility timezone, service date) and **place-bound** (the physical room).

An **Operational Cycle** is the Department’s recurring window. A **Phase** is one interval inside it. A **Key Point** is an instant on it, with occurrence tracking NONE, OPTIONAL, or REQUIRED. Current cycles are derived. Cycles may overlap and may cross midnight. Phases may overlap and may leave gaps. Key Points are not Work.

Build reads the working profile. Run reads the ACTIVE profile. Audit reads the profile effective on the requested service date. Department responsibility is not cycle participation and is not a Location Function binding.

Dietary timing actuals are `OperationalCycleKeyPointActual`. Meal Due tracks NONE. Ready and Service Started track REQUIRED at LOCATION grain. Plant Operations is not designed and is not forced through a meal rhythm. Work may bind to a Cycle or Phase. An empty Cycle binding means the Work is not configured to a rhythm.

---

## How the pieces interact

### Operational Cycle

The current window is a published Operational Cycle, not a separate meal-milestone engine. Surfaces that need “now” read that published rhythm.

### Work

Expected Work is derived from a published Work Plan. Assignment is optional and does not create the requirement. Sparse WorkOccurrences record that someone acted.

### Readiness

Answers: **Can this location support the current commitment?**  
States: **Ready / In Progress / Needs Attention** (internal code may still say `blocked`).  
Department profiles change *which* signals matter (Dietary vs EVS vs Plant). Incomplete *future* logs must not paint today red.

### Issues, repairs, and Records

- **Issue** — disruption requiring recovery.  
- **Repair** — equipment work-order persistence already in the platform.  
- **Inspection** — a Record form, not a second engine.  

### Homes

| Surface | Question it answers |
|---------|---------------------|
| Business Workspace | What should **I** personally do next? |
| Today's Work | What is happening today, and what expected Work does the operation need? |
| Unit Workspace | What do I do **standing here**? |
| Audit / Reports | What was expected, and what was recorded, for this service date? |

If a design makes two homes answer the same question the same way, **one home is wrong**.

### AI Moments

Compress the same loop into **read-only or assistive summaries**:

- Morning Brief → Dashboard peek when cached  
- Shift Transition → Today's Work  
- Recovery Assistant → Issue detail  

AI must not become the operational system of record and must not invent due times.

### Knowledge

Closes the improvement loop by putting SOPs at submission, unit, and issue contexts — reducing training load without creating a second wiki product.

---

## Design implications

1. New features attach to a stage in the loop (or they are out of bounds).  
2. Summaries always deep-link to Execution or Verification owners.  
3. Preference and AI never invent Work.  
4. Multi-facility means **restarting the loop** for the destination facility — never blending loops.

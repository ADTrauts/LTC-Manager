# 05 — Operational Philosophy

**Status:** How day-of operations should work in LTC Manager  

---

## The operating loop

```text
Operations          What commitment are we in? (Breakfast / Lunch / Dinner / Close)
        ↓
Work                What must be done for that commitment?
        ↓
Execution           Do it at the Unit Workspace (and staffing surfaces)
        ↓
Verification        Readiness, inspections, findings, log completion
        ↓
Knowledge           How we do it correctly, attached to the moment
        ↓
Improvement         Handoffs, briefs, recovery — feed the next operation
```

This loop is **time-bound** (facility timezone, service day, active operation) and **place-bound** (unit / location).

---

## How the pieces interact

### Operations Engine

Defines the **bounded commitment** (e.g., Lunch Preparation → Execution). When the feature flag is off, meal/servery heuristics approximate the same idea. Surfaces that need “now” should consume one shared operation context — not invent clocks.

### Work Engine

Projects episodic work (logs, repairs/issues, inspections) into a **Task** dual-write when enabled. Users still live in domain UIs; Task is substrate for future unified inboxes — not a second competing queue today.

### Readiness

Answers: **Can this location support the current commitment?**  
States: **Ready / In Progress / Needs Attention** (internal code may still say `blocked`).  
Department profiles change *which* signals matter (Dietary vs EVS vs Plant). Incomplete *future* logs must not paint today red.

### Issues / Repairs / Inspections

- **Issue** — disruption requiring management recovery.  
- **Repair** — persistence and equipment history (often the same record).  
- **Inspection** — planned verification; findings may spawn follow-up work.  

Together with logs they **feed readiness** and **appear** on OC / Today / Workspace Focus.

### Business Workspace vs Operations Center vs Today's Work

| Surface | Question it answers |
|---------|---------------------|
| Business Workspace | What should **I** personally do next? |
| Operations Center | What is broken **across the site** right now? |
| Today's Work | Where should **I walk / cover / hand off** as supervisor? |
| Unit Workspace | What do I do **standing here**? |

If a design makes two homes answer the same question the same way, **one home is wrong**.

### AI Moments

Compress the same loop into **read-only or assistive summaries**:

- Morning Brief → OC (+ cached Workspace peek only)  
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

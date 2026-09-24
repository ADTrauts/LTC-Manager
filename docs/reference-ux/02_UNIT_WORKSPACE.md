# Unit Workspace

**Primary audience:** Frontline staff executing work at a single location  
**Status:** Canonical execution experience  
**Parent:** [00_REFERENCE_UX_INDEX.md](./00_REFERENCE_UX_INDEX.md)

---

## Definition

The **Unit Workspace** is the experience of working **inside one operational location** — a servery, kitchen, retail counter, storage room, EVS zone, mechanical closet, laundry staging area, or any other place where physical work happens.

It is the **primary execution surface** of the platform. Not a detail page. Not a sub-module. **The place where work lives.**

When someone stands at a location, the platform should feel like it was built **for this room**, not for the enterprise.

---

## User mindset

A frontline worker arrives **already in motion**: keys in hand, gloves on, three things to check before service, a coworker shouting a change, a machine that "always acts up on Tuesdays."

They need **orientation in one breath**:

- What operation am I part of right now?
- What must happen here before we are ready?
- What is already wrong that I should know about?

They do not want a tour of the organization. They want **this place, this window, this work**.

---

## Goals

| Goal | Success feels like |
|------|-------------------|
| **Instant orientation** | I know where I am and what operation is active |
| **Clear next actions** | I see what to do next — not a list of everything possible |
| **Local truth** | Equipment, issues, and knowledge for *here* are visible |
| **Calm completion** | I finish my part without navigating away |
| **Easy escalation** | I can report a problem without leaving the workspace |

---

## Location types, same experience pattern

Whether the location is a servery, kitchen, retail point, storage area, EVS zone, or mechanical room, the workspace answers the **same structural questions** with location-appropriate content:

| Location type | Typical active operation | What "ready" means here |
|---------------|--------------------------|-------------------------|
| Servery | Meal service window | Staffed, equipped, logs done, service started |
| Kitchen | Production window | Prep complete, temps good, output staged |
| Retail | Service period | Stocked, temps good, point-of-service ready |
| Storage | Staging / issue response | PAR met, picks available for downstream |
| EVS zone | Cleaning round | Status set, access clear, issues reported |
| Mechanical room | PM or response | Asset status known, work documented |

The **shape** of the experience is universal. The **content** is configured per location type and industry.

---

## Information hierarchy

### Layer 1 — Orientation (always first)

| Element | User understands |
|---------|------------------|
| **Location name** | Where I am standing |
| **Active operation** | What service commitment this place serves right now |
| **Operation phase** | Preparation, execution, support, transition, or closed |
| **Readiness here** | Ready, in progress, degraded, or blocked — for this location |

### Layer 2 — What needs to happen (execution)

| Element | User understands |
|---------|------------------|
| **Open work** | Checklists, confirmations, and tasks due **here** for this operation |
| **Critical timing** | When service starts, when handoff is due, when round must complete |
| **Today's differences** | Menu change, headcount change, isolation hold — what is not routine |

### Layer 3 — Context (supporting execution)

| Element | User understands |
|---------|------------------|
| **Equipment that matters here** | Assets I depend on — and their status |
| **Open issues here** | What is broken or short — and whether I can work around it |
| **Knowledge for this location** | How *this* servery differs, equipment quirks, procedure notes |
| **Who is with me** | Who is assigned here for this operation (not full site roster) |

### Layer 4 — Actions (when needed)

| Element | User understands |
|---------|------------------|
| **Report a problem** | Equipment, supply, safety — without blame, without complexity |
| **Request help** | Supervisor, cross-coverage, plant — appropriate to severity |
| **Handoff signal** | Mark ready, mark started, mark complete — operational milestones |

**Rule:** Layer 1 and 2 dominate. Layer 3 appears when relevant. Layer 4 is always available but never shouts over Layer 2.

---

## Core questions answered

The Unit Workspace must answer immediately:

| Question | Experience answer |
|----------|-------------------|
| **What operation am I participating in?** | Named operation + time window + phase |
| **What needs to happen here?** | Ordered open work for this location and operation |
| **What equipment matters?** | Dependent assets with status — not full site asset registry |
| **What issues exist?** | Open issues affecting this location — impact stated plainly |
| **What work is still open?** | Remaining checks and tasks — not yesterday's history |
| **What knowledge belongs here?** | Location notes, equipment tips, procedure help — in context |

---

## Operational flow

```
Arrive at location → Open Unit Workspace (or land here via kiosk)
                  → Read orientation (operation, phase, readiness)
                  → Execute open work (checks, milestones, service)
                  → Encounter problem → Report without leaving
                  → Complete or hand off → See transition prompt if next phase exists
```

The workspace **follows the worker through the operation**, not the clock through arbitrary modules.

During **preparation**, open work emphasizes readiness checks. During **execution**, emphasis shifts to in-service checks and milestones. During **transition**, emphasis shifts to close-out and what carries to the next operation.

---

## Relationship to Operations Center

| Operations Center | Unit Workspace |
|-------------------|----------------|
| Site-wide readiness | Location readiness |
| Where should manager go? | What should worker do here? |
| Aggregates exceptions | Executes and reports exceptions |
| Prioritizes across locations | Deepens within one location |

Drill-down from center to workspace must preserve **context**: the manager arrives already knowing *why* this location matters.

---

## UX principles (Unit Workspace)

1. **One place, one truth** — nothing in the workspace contradicts what the floor knows.
2. **Next action prominence** — the most urgent incomplete work is obvious.
3. **No organizational noise** — no unrelated locations, no admin, no site politics.
4. **Milestones are human** — "meal ready," "round complete," not abstract status codes.
5. **Problems are easy** — reporting feels safe and fast; recovery is acknowledged.
6. **Knowledge when stuck** — help appears when work requires it, not as mandatory reading upfront.
7. **Operation-scoped memory** — when the operation changes, the workspace resets to the new context clearly.

---

## Kiosk and locked-location experience

When a device is bound to a single location, the workspace **is the application** for that worker.

- No location picker required.
- Orientation is instant — they are always "here."
- If they are covering another location, the experience acknowledges variance without punishing them.

---

## Cross-industry examples

| Industry | Unit Workspace at… | User completes… |
|----------|-------------------|-----------------|
| LTC | 4A Servery | Opening checks, meal ready, service logs |
| Hospital | 3 North nourishment | Temps, restock, handoff to nursing |
| K-12 | Main café line | HACCP checks, service start |
| University | Student union retail | Grab-and-go temps, outage report |
| Corporate | Floor 12 micro-market | Stock check, cooler issue |
| EVS | West wing zone | Room status round, spill response |
| Plant | Kitchen mechanical | Chiller check, PM note |
| Laundry | Clean linen staging | Count confirm, distribution ready |
| Hospitality | Banquet pantry | Event prep checklist, service handoff |

---

## Anti-patterns

- Workspace that mirrors the manager dashboard at smaller scale.
- Full site issue list dumped on a servery worker.
- Requiring navigation to a separate "logs module" to complete work due here.
- Knowledge base link that leaves the floor.
- Empty workspace when operation is active — always show operation context.
- Hiding open issues that affect this location.

---

## Related documents

- [04_EMPLOYEE_WORKSPACE.md](./04_EMPLOYEE_WORKSPACE.md) — employee-specific calm and clarity
- [01_OPERATIONS_CENTER.md](./01_OPERATIONS_CENTER.md) — manager counterpart
- [08_OPERATIONAL_KNOWLEDGE.md](./08_OPERATIONAL_KNOWLEDGE.md) — contextual knowledge
- [05_OPERATION_TIMELINE.md](./05_OPERATION_TIMELINE.md) — phases at a location

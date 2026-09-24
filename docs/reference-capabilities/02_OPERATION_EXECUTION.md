# Capability: Operation Execution

**Capability ID:** CAP-02  
**Parent:** [00_REFERENCE_CAPABILITIES_INDEX.md](./00_REFERENCE_CAPABILITIES_INDEX.md)

---

## Purpose

**Execute recurring operations** — fulfill service commitments within defined time windows through coordinated phases, milestones, and handoffs.

Execution is where the promise is **kept or lost**.

---

## Operational promise

The organization can **run the day's rhythm** — opening through closing, meal to meal, round to round — with clear phase, milestones, and transitions. Everyone knows **what operation is active**, **what phase it is in**, and **what done looks like**.

---

## Inputs

- **Operation definition** — name, time window, participating departments, success criteria.
- **Readiness clearance** — per location and scope (from Operation Readiness).
- **Workforce placement** — who is where (from Workforce and Coverage).
- **Production or service content** — menu, round plan, PM schedule, event brief.
- **Location context** — where work happens (from Asset and Location).
- **Resources** — supplies available (from Supply and Resources).
- **Knowledge** — procedures and today's changes (from Operational Knowledge).
- **Open issues** — known constraints (from Issue and Recovery).

---

## Outputs

- **Active operation state** — which operations are live, upcoming, closed.
- **Phase** — opening, preparation, execution, support, recovery, transition, closing.
- **Milestones** — service ready, service started, round complete, distribution done, shutdown complete.
- **Handoff confirmations** — upstream delivered, downstream received.
- **Completion record** — operation closed with outcome — success, partial success, or failed with reason.
- **Compliance evidence** — checks completed as part of execution, not separate from it.

---

## Users

| User | Role in execution |
|------|-------------------|
| **Employee** | Performs work; records milestones and checks |
| **Supervisor** | Coordinates locations; validates milestones and handoffs |
| **Manager** | Oversees multiple operations; resolves cross-operation conflict |
| **Support departments** | Plant, diet office, logistics — parallel support during execution |

---

## Lifecycle

Execution follows the operational lifecycle:

```
Planning → Preparation → Execution → Support → Recovery → Review → Transition → Closing
```

Not every operation emphasizes every phase. A routine lunch emphasizes preparation and execution. A survey day adds planning intensity. **Phases may overlap** — lunch prep during breakfast execution.

---

## Participants

Operations involve **multiple departments** with distinct segments:

- **Primary department** — owns the service commitment (food service, EVS, laundry).
- **Support departments** — plant, supply, clinical liaison, housekeeping.
- **Handoff partners** — upstream producers, downstream receivers.

Each participant has **segment milestones** that roll up to operation success.

---

## Milestones

Milestones are **human-meaningful events** in execution:

| Example milestone | Industries |
|-------------------|------------|
| Service ready | Dining, hospitality |
| Service started | Dining, retail |
| Production complete | Kitchen, laundry |
| Round complete | EVS, housekeeping |
| Distribution complete | Laundry, porter routes |
| PM check complete | Plant |
| Close-out complete | All |

Milestones drive **readiness transitions** and **awareness**.

---

## Transitions

Transitions between operations are **high-risk** and first-class:

- What ended open?
- What carries to the next window?
- What preparation starts now?

Examples: breakfast → lunch prep; morning round → afternoon round; event service → breakdown.

---

## Dependencies

Operations depend on:

- **Prior operation completion** — kitchen cannot prep lunch until breakfast breakdown far enough.
- **External events** — delivery arrival, clinical census change.
- **Asset reliability** — equipment from Asset and Location capability.
- **Cross-site** (future) — central kitchen serving multiple locations.

Dependencies surface as **blockers or at-risk** in readiness and intelligence.

---

## Relationships

| Capability | Relationship |
|------------|--------------|
| **Operation Readiness** | Gates start; monitors during execution |
| **Workforce and Coverage** | Provides participants |
| **Issue and Recovery** | Interleaves when plan breaks |
| **Supply and Resources** | Consumed during execution |
| **Operational Knowledge** | Guides correct execution |
| **Operational Intelligence** | Reports execution health live |
| **Analytics** | Measures execution outcomes over time |

---

## Operational rules

1. **One active operation context** per location at a time — clarity for floor.
2. **Milestones are voluntary to record but valuable** — they anchor awareness.
3. **Execution generates compliance** — checks belong to the operation moment.
4. **Partial completion is recordable** — honest closure beats silent failure.
5. **Nested operations** roll up — child segment failure can block parent.
6. **Industry configures operation catalog** — same capability, different operation types.

---

## Success criteria

| Criterion | Measure |
|-----------|---------|
| **Commitment fulfilled** | Service delivered per success criteria |
| **On time** | Within committed window or variance communicated |
| **Safe** | No preventable safety incidents from execution gaps |
| **Coordinated** | Handoffs completed; departments aligned |
| **Traceable** | Enough record to review and comply without reconstructing |

---

## Future extensibility

- **Operation templates** per industry — breakfast, lunch, terminal clean round, linen turn.
- **Sub-operation trees** — explicit parent/child for complex sites.
- **Event operations** — one-off catering, survey, move-in surge.
- **Cross-site operations** — operator-run production serving many locations.
- **Customer-visible status** (optional) — service delay communication where appropriate.

---

## Example operations (cross-industry)

| Operation | Typical window |
|-----------|----------------|
| Breakfast service | Morning meal period |
| Lunch service | Midday meal period |
| Dinner service | Evening meal period |
| Opening | Start of site operational day |
| Closing | End of site operational day |
| Cleaning round | EVS zone cycle |
| Preventive maintenance | Scheduled plant window |
| Laundry distribution | Clean turn delivery |
| Retail opening | Grab-and-go service start |
| Banquet service | Event-specific |

---

## Experience alignment

Surfaces through [Operation Timeline](../reference-ux/05_OPERATION_TIMELINE.md), [Unit Workspace](../reference-ux/02_UNIT_WORKSPACE.md), and [Operations Center](../reference-ux/01_OPERATIONS_CENTER.md).

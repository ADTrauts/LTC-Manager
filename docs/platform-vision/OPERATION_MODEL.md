# Operation Model

**Status:** Primary conceptual reference  
**Date:** 2026-07-07  
**Governed by:** [PRODUCT_CONSTITUTION.md](./PRODUCT_CONSTITUTION.md)

This document defines what an **Operation** is and how real-world physical service works. It is the conceptual center of the platform.

The platform is not a collection of modules — logs, staffing, repairs, menus. It is an **Operations Platform**. Every capability exists to help teams **execute operations successfully**. When product, design, or engineering debates arise, this document resolves them.

This is not a technical specification. It does not describe databases, screens, or integrations. It describes **how work actually happens** and how that work should be understood.

---

## 1. Definition

An **Operation** is a coordinated effort by one or more departments to fulfill a **service commitment** within a defined **time window** at one or more **locations**.

Operations are the unit of meaning managers use to run a day. They are not forms, tickets, or schedules — those are instruments. The Operation is the **promise being kept** (or at risk): breakfast out on time, the west wing cleaned before rounds, the chiller holding through lunch service, the laundry turn returned before evening change.

Every Operation has:

| Element | Meaning |
|---------|---------|
| **Beginning** | When preparation starts — not when service is visible to the customer. Kitchen prep, porter pickup, zone inspection. |
| **End** | When the service commitment is fulfilled or formally closed for that window — trays picked up, dining room reset, round signed off. |
| **Participants** | People and departments with roles in the Operation — cooks, servers, porters, supervisors, nursing liaisons, plant mechanics. |
| **Readiness** | The combined state of people, equipment, supplies, environment, knowledge, and communication required to start and sustain execution. |
| **Success criteria** | What "good" looks like when the Operation completes — safe, on time, correct, complete, documented where required. |
| **Exceptions** | Variances from plan — call-off, broken equipment, missing delivery, isolation hold, survey walk-through. |
| **Completion** | Explicit or implicit acknowledgment that the Operation ended — meal service started at all serveries, round complete, issue resolved or handed off. |

**Examples of Operations:**

- **Breakfast service** — Tuesday, 6:30–9:00, all serveries and the central kitchen.
- **Lunch production and distribution** — tray line, bulk dining, retail grab-and-go.
- **EVS morning round** — Zones 1–4, before clinical rounds.
- **Filter change week** — Plant operations, mechanical closets across the building.
- **Catering event** — Corporate dining, Conference Center B, 11:45 service.

Operations recur. Most physical service organizations run the **same Operations daily or weekly** with different participants, menus, and exceptions — but the same structural commitment.

Operations nest. **Breakfast service** contains sub-operations: kitchen production, porter delivery, servery opening, floor service. The parent Operation succeeds only when critical sub-operations succeed or recover.

Operations hand off. Kitchen finishes; porters move; serveries open; nursing receives. Each segment has its own readiness and timing, but together they form one service commitment to the people being served.

---

## 2. Why Operations Matter

Managers do not wake up thinking about modules.

They do not think:

- "I need to complete temperature logs."
- "I need to update the staffing grid."
- "I need to open a repair ticket."

They think:

- **"I need breakfast to go out successfully."**
- **"I need every servery ready before 7:15."**
- **"I need to know if we're short on 4 West."**

Logs, staffing, equipment checks, supply counts, repairs, call-downs, and messages are **not the job**. They are **how the organization stays aware, compliant, and coordinated** while doing the job.

When software organizes around modules, managers mentally **assemble the picture** every morning — cross-referencing spreadsheets, radios, and memory. When software organizes around Operations, the picture is **the default view**.

| Module-centric thinking | Operation-centric thinking |
|-------------------------|----------------------------|
| "Did we do the logs?" | "Is breakfast safe and ready?" |
| "Who is on the schedule?" | "Who is covering 4A for lunch?" |
| "Is there an open work order?" | "Can we hold hot food on 3 North?" |
| "What's on the menu?" | "What are we producing for this meal?" |

Operations are how experienced supervisors **already think**. The platform should match that mental model, not fight it.

---

## 3. Operation Lifecycle

Operations move through phases. Not every Operation passes through every phase with equal weight — a routine breakfast is mostly Preparation and Execution; a survey day adds Planning and Review. The lifecycle is a **lens**, not a rigid checklist.

```
Planning
    ↓
Preparation
    ↓
Execution
    ↓
Support
    ↓
Recovery
    ↓
Review
    ↓
Transition to next Operation
```

### Planning

**What happens:** The organization decides what must happen, when, where, and with whom — before the service window opens.

- Menu cycle and production sheets.
- Staff schedule and default assignments.
- Known events: catering, survey, holiday menu, construction closure.
- Equipment PM due this week.
- Par levels and delivery expectations.

**Operational truth:** Planning is never perfect. It establishes **intent** so Preparation and Execution have something to deviate from.

### Preparation

**What happens:** The site gets ready to perform — before the customer-facing moment.

- Kitchen prep, line setup, sanitizer buckets filled.
- Porters staging carts.
- Serveries unlocked, warmers on, logs started.
- Staff arriving, stations assigned.
- EVS completing pre-round cleaning.
- Supplies staged at point of use.

**Operational truth:** Preparation is where **readiness** is won or lost. Most service failures trace to preparation gaps, not execution skill.

### Execution

**What happens:** The service commitment is actively delivered.

- Meal served, trays delivered, dining room open.
- Temperatures checked during service, not only before.
- Porters circulating, serveries restocked.
- Supervisors walking the floor, redirecting people.
- Real-time communication: "4A needs cover," "hold fish on 2."

**Operational truth:** Execution is visible and unforgiving. Time windows are tight. Errors affect people immediately.

### Support

**What happens:** Parallel work sustains the Operation while it runs.

- Plant responds to equipment trouble without stopping the line.
- Diet office adjusts counts, therapeutic changes.
- Supply run for missed delivery.
- Nursing coordination for isolation trays, late admissions.
- Call-down coverage arriving mid-meal.

**Operational truth:** Support is not "after" execution — it **interleaves** with it. A successful Operation assumes support channels exist and respond.

### Recovery

**What happens:** Something went wrong; the organization adapts without abandoning the commitment.

- Reassign staff, reduce menu scope, delay a servery, escalate to manager.
- Substitute equipment, borrow from another unit, reroute porters.
- Document the variance, complete follow-up work later.
- Accept partial success with explicit acknowledgment ("dinner late on 5 North, resolved by 6:15").

**Operational truth:** Recovery is **normal**, not shameful. Mature operations plan for disruption and measure resilience, not only perfection.

### Review

**What happens:** After the window closes, the organization learns — briefly, practically.

- What failed? What saved us? What repeats tomorrow?
- Compliance records completed or flagged.
- Issues closed or queued for plant.
- Short conversation at shift change, not only monthly meetings.

**Operational truth:** Review is often skipped under pressure. The best organizations keep it **short and attached to the Operation**, not buried in a monthly report.

### Transition to next Operation

**What happens:** Closure of one window and handoff to the next.

- Breakfast ends; lunch prep begins.
- Dining room reset; EVS post-meal clean.
- Servery shutdown logs; dinner production starts.
- Shift change briefing: what's open, what's different.

**Operational truth:** Transitions are high-risk moments. Staff, equipment, and information must **carry forward** — not reset to zero.

---

## 4. Operational Readiness

**Readiness** is whether an Operation **can start and sustain** at a given location, at a given moment, with acceptable risk.

Readiness is not binary in practice — it is **degrees of ready**: not started, in progress, ready, degraded, blocked.

Readiness is assessed across dimensions:

### People

- Right roles present or coverage arranged.
- Staff know their station and today's differences.
- Supervisors available to decide exceptions.
- Cross-trained backup exists or call-down in flight.

**Ready:** Scheduled cook and server on station; floater within reach.  
**Not ready:** No server assigned; call-down unanswered.

### Equipment

- Assets required for the Operation functional at the location.
- Warmers, dish machines, refrigeration, transport carts.
- Known issues communicated; workarounds in place if degraded.

**Ready:** Hot box holding; sanitizer dispenser working.  
**Not ready:** Warmer out; hot food cannot be held safely.

### Supplies

- Consumables at point of use — trays, lids, chemicals, disposables.
- Production ingredients available for today's menu.
- Par not met is a readiness gap, not only a purchasing problem.

**Ready:** Tray covers stocked at servery.  
**Not ready:** Out of domes; service format must change.

### Knowledge

- Staff know today's menu, therapeutic requirements, and procedure changes.
- SOPs and equipment notes available **at the moment of work**.
- New hires briefed on this location's quirks.

**Ready:** Substitute cook reviewed today's production sheet.  
**Not ready:** No one on station has opened this servery before.

### Compliance

- Required pre-service checks complete or in progress on schedule.
- Regulatory and policy gates satisfied before risk increases — temps, sanitizer, FIFO.
- Compliance supports readiness; it does not replace it.

**Ready:** Opening temp log complete; no failures.  
**Blocked:** Failed cooler temp; food cannot be staged.

### Environment

- Physical space usable — clean, accessible, appropriate status.
- EVS clearance for dining or service areas.
- Isolation, construction, or weather affecting access.

**Ready:** Dining room clean; servery accessible.  
**Not ready:** Terminal clean pending; room cannot open.

### Communication

- Handoffs received from upstream — kitchen to porter, porter to servery.
- Open issues visible to who needs them.
- Call-downs acknowledged; nursing informed of delays.

**Ready:** Porter confirmed pickup time; 4A knows menu change.  
**Not ready:** Kitchen and serveries operating on different assumptions.

**Readiness is location-specific and time-specific.** Building 4 can be ready while Building 7 is blocked. Breakfast can be ready while lunch prep has not started.

---

## 5. Operational Health

**Operational health** is whether the Operation is **achieving its service commitment** — not merely whether paperwork is complete.

| Task completion | Operational health |
|-----------------|-------------------|
| Log submitted | Food held at safe temperature throughout service |
| Schedule published | Every servery staffed for the meal window |
| Work order closed | Equipment reliable through the Operation |
| Form signed | Residents received correct meals on time |

A site can have **100% log completion** and **failing operations** — if logs were rushed, falsified, or disconnected from reality. Conversely, a chaotic but successful meal service may leave **follow-up documentation** incomplete — health was good; compliance debt remains.

**Healthy Operation indicators:**

- Service started within the committed window (or variance communicated early).
- No safety incidents attributable to preparation or execution gaps.
- Exceptions surfaced before they became crises.
- Handoffs between departments occurred without dropped balls.
- Staff could answer "what are we doing now?" without confusion.
- People being served experienced continuity — correct food, on time, safely.

**Unhealthy Operation indicators:**

- Silent failures — servery late, no one escalated.
- Paperwork green, floor red — logs done, warmer empty.
- Repeated exceptions without recovery pattern.
- Departments working from different facts.
- Supervisors learning problems from complaints, not systems.

The platform must optimize for **health signals**, with compliance and tasks in service of health — not the reverse.

---

## 6. Operational Disruption

Disruption is **expected**. Physical operations run in buildings full of people, equipment, and weather — not laboratories.

Common disruptions:

| Disruption | Effect on Operations |
|------------|---------------------|
| **Staffing shortages** | Call-offs, no-shows, floaters pulled to another unit, agency late |
| **Equipment failures** | Warmer down, dish machine stuck, elevator offline for carts |
| **Late deliveries** | Sysco short, chemical backorder, wrong tray shipment |
| **Call-offs and mid-shift departures** | Sudden gap during active service |
| **Emergency surveys** | Unannounced walk-through; immediate cleanliness and documentation demand |
| **Resident / patient / customer changes** | New admissions, isolations, diet changes, allergen alerts, headcount swings |
| **Supply shortages** | Out of trays, domes, labels, sanitizer at point of use |
| **Interdepartment delays** | Kitchen late, porter bottleneck, nursing hold on tray pass |
| **Facility events** | Power blip, fire drill, construction blocking corridor |
| **Communication breakdown** | Wrong assumption propagated; handoff missed |

Disruptions cluster. A call-off plus a broken warmer plus a late delivery is one breakfast — not three unrelated tickets.

Disruptions are **time-bound**. A supply short matters **for this lunch**; a broken chiller matters **until repaired or mitigated**.

Organizations that treat disruption as exceptional blame people. Organizations that treat disruption as **structural** build recovery into how they run Operations.

---

## 7. Operational Recovery

**Recovery** is how an Operation **continues or closes acceptably** after disruption.

Recovery actions:

| Action | When used |
|--------|-----------|
| **Reassign staff** | Cover station, send floater, supervisor fills gap temporarily |
| **Escalate** | Decision beyond floor authority — menu change, servery delay, safety stop |
| **Reduce scope** | Simplified menu, fewer service points, bulk-only delivery |
| **Delay non-critical work** | Defer PM, skip optional steps, postpone secondary locations |
| **Create follow-up work** | Repair ticket, supply order, training note, schedule correction |
| **Communicate variance** | Nursing, diet office, customers — early, explicit |
| **Accept degraded mode** | Run with backup equipment, manual process, documented risk |
| **Stop and reset** | When safety requires — hold service until resolved |

**Resilience** is not preventing all disruption. It is:

- **Seeing** disruption early.
- **Deciding** quickly with shared awareness.
- **Acting** without losing the thread of the service commitment.
- **Recording** enough to learn and comply — after or during, not instead of, action.

Recovery leaves **traces**: override reason, call-down history, issue updates, supervisor notes. Those traces are how the next Operation benefits — not bureaucracy for its own sake.

A culture that punishes visible recovery drives problems underground. A platform that surfaces recovery **honors** how good sites actually work.

---

## 8. Cross-Department Operations

Most meaningful Operations **span departments**. No single team owns breakfast service end to end.

**Example: Breakfast Service in a complex long-term care site**

```
Dietary (production)
    ↓  trays / bulk / retail prepared
Porters (distribution)
    ↓  carts to floors and serveries
Nursing / floor staff (receiving)
    ↓  residents served or servery opened
Residents / customers (experience)
    ↓  feedback, late admissions, isolations
Diet Office (coordination)
    ↓  counts, therapeutics, changes
Kitchen (production loop)
    ↓  replenishment, next meal prep
Environmental Services (environment)
    ↓  dining areas, spills, terminal cleans
Plant Operations (equipment)
    ↓  warmers, dish, refrigeration
```

Each department has:

- Its own **readiness** requirements.
- Its own **tasks** within the Operation.
- Its own **success criteria** — and shared criteria for the whole.

**Handoffs** are the fragile joints:

| Handoff | What must cross |
|---------|-----------------|
| Kitchen → Porter | What is ready, what is hot, what is held, what changed |
| Porter → Servery / floor | What arrived, what is missing, what is urgent |
| Nursing → Dietary | New diets, NPO changes, isolations, count changes |
| EVS → Dietary | Room status, dining availability |
| Plant → Dietary | Equipment status, ETA, workaround |
| Supervisor → All | Priorities, call-downs, scope reductions |

When handoffs fail, departments each believe they succeeded — the **Operation** failed.

The platform must make handoffs **visible**: what was promised, what was received, what is open. Not by forcing everyone into one department's tool — by anchoring shared context to the **Operation** and **location**.

---

## 9. Operational Knowledge

Knowledge in physical operations is **situational and embodied** — then lost when people leave.

Types of operational knowledge:

| Type | Examples |
|------|----------|
| **SOPs** | Opening a servery, breaking down a line, isolation tray procedure |
| **Photos / video** | Correct tray setup, equipment controls, valve locations |
| **Equipment notes** | "Warmer 3 runs hot — set to 4 not 5" |
| **Known issues** | Intermittent ice machine; use backup until Tuesday |
| **Historical lessons** | Last survey flagged garnish station; extra check before lunch |
| **Training** | New hire checklist for this location, not generic orientation |
| **Policy** | Union rules for call-down order; handbook discipline steps |
| **Menu context** | Why today's texture modification matters for 4 West |

**Knowledge belongs to the work, not the person.**

When knowledge lives only in Maria's head or a binder in the manager's office, the Operation fails on Maria's day off.

Knowledge attaches to:

- **Locations** — how this servery differs from that one.
- **Assets** — quirks of this dishwasher.
- **Operations** — what always goes wrong on holiday brunch.
- **Tasks and issues** — what was tried, what worked.

Knowledge retrieved **during** the Operation beats knowledge buried in a separate repository. The question is not "where is the wiki?" but "what do I need **right now** at this station for this meal?"

---

## 10. Operational Awareness

**Operational awareness** is the ability of leaders and supervisors to answer, **immediately and accurately**:

| Question | Why it matters |
|----------|----------------|
| **Are we ready?** | Can we start or continue the Operation? |
| **What is blocked?** | What prevents readiness or health? |
| **Where should I go?** | Highest-risk location, highest-value use of my attention |
| **What changed?** | Since the plan — counts, staff, equipment, menu |
| **What is most at risk?** | If one thing fails next, what hurts people or service most? |

Awareness is **time-bound**. Awareness of breakfast at 6:45 is stale by 9:00. Awareness without location is incomplete — "we're fine" is not fine if 4A is not.

Awareness is **shared or it is fiction**. Two supervisors with different pictures will make conflicting recovery decisions.

Awareness is not a report run yesterday. It is a **living picture of now and next** — exceptions first, drill-down second.

The opposite of awareness is:

- Walking the building to discover what the system already knew.
- Learning from nursing that lunch was late — after lunch.
- Finding a failed temp log during a survey.
- Radio traffic because nothing was visible centrally.

---

## 11. Operational Success

**Success** is fulfillment of the **service commitment** to the people being served — safely, with dignity, on time, and as planned within acceptable variance.

Success is not:

- All forms submitted regardless of outcome.
- Schedule unchanged regardless of reality.
- Zero issues reported because issues were hidden.

**Examples of success:**

| Operation | Success looks like |
|-----------|-------------------|
| Breakfast service | Residents received correct meals, safe temperatures, within committed window; serveries opened on schedule or delays communicated |
| Lunch in bulk dining | Line stable, therapeutic diets honored, no allergen incidents |
| EVS morning round | Zones ready for clinical and dietary access; isolation rooms correctly flagged |
| Retail grab-and-go | Items available before peak; temps maintained |
| Catering event | Service at 11:45, correct headcount, breakdown complete |
| Plant PM window | Critical equipment reliable through next meal Operations |

**Contributors to success:**

- Staff knew what to do and had what they needed.
- Equipment functioned or workarounds were explicit and safe.
- Disruptions were surfaced and recovered before affecting service.
- Handoffs worked across departments.
- Compliance evidence exists because work was done — not instead of work.

**Partial success** is real: dinner late on one wing, resolved and communicated, is better than silent failure. The platform should allow **honest closure** — not only binary pass/fail.

---

## 12. Relationship to the Domain Model

Every concept in the platform exists to **support Operations**. Nothing is gratuitous.

| Concept | Role in Operations |
|---------|-------------------|
| **Organization** | Runs many sites; repeats Operational patterns; shares knowledge and standards across Operations |
| **Site** | Where Operations occur — one campus, building, or hospital; bounded by time zone, roster, locations |
| **Department** | Operational lane with responsibilities in Operations — food service, EVS, plant; owns tasks, routing, readiness dimensions |
| **Location** | Where work is executed within an Operation — servery, kitchen, zone, closet; readiness is assessed per location |
| **Operation** | The central object — service commitment, time window, lifecycle, health |
| **Task** | Work within an Operation — assignable, completable, recoverable; call-down, follow-up, ad-hoc |
| **Log** | Compliance and verification task — evidence that safety and policy gates were met **for this Operation at this location** |
| **Issue** | Something wrong threatening Operations — equipment, supply, environment, safety |
| **Asset** | Equipment Operations depend on — failure creates disruption; PM prevents disruption |
| **Supply** | Consumables Operations consume — shortage creates disruption |
| **Person** | Participant in Operations — scheduled, assigned, covering, escalating |

**Relationships:**

- Operations happen at **Sites**, across **Locations**, involving **Departments** and **People**.
- **Tasks** and **Logs** are how work and evidence attach to Operations.
- **Issues** and **Supply** gaps threaten Operational health.
- **Assets** enable or constrain Operations.
- **Readiness** aggregates signals across dimensions for a Location within an Operation.
- **Awareness** is the supervisor's view of Operation health and readiness across Locations.
- **Organization** scales what works at one Site to many.

If a feature does not connect to an Operation, ask why it exists.

---

## 13. Platform Implications

Centering Operations changes what the platform **is**, without prescribing how it is built.

| Today (module-centric) | Tomorrow (operation-centric) |
|------------------------|-------------------------------|
| Dashboard of mixed widgets | **Operations Center** — current and next Operations, health, exceptions |
| Logs module | Compliance work **within** the Operation — "what's due for breakfast" |
| Staffing module | Coverage **for** the Operation — who is where for this window |
| Repairs module | Issues **blocking** Operations — equipment and environment |
| Menus module | Production context **for** the Operation |
| Reports | **Operation outcomes** over time — health, recovery, patterns |
| Notifications | **Operation events** — blocked, at risk, handoff needed, recovered |
| Scheduling | **Intent** for who participates in recurring Operations |
| Tasks | Unified work **inside** Operations — not a separate todo app |
| Readiness | Property of **Location × Operation** — not a scattered inference |
| AI assistance | Summarizes **Operations** — "breakfast at risk on 4A because…" — not raw data dumps |

**Everything orbits Operations:**

- Configuration defines recurring Operations and what readiness requires.
- Floor surfaces optimize for **active Operation** at **this Location**.
- Managers live in **now and next Operations**.
- Historical analysis asks **which Operations failed and why**, not only which forms were late.
- Industry packs define **typical Operations and readiness rules** for LTC, hospital, K-12, university, corporate, EVS, plant — not different products.

The platform does not abandon logs, staffing, or issues. It **reframes** them as instruments of Operational success.

---

## 14. Long-Term Vision

This Operation Model applies wherever **recurring physical service** must be coordinated across people, places, time, and departments.

The philosophy is the same whether the service commitment is:

- Meals to residents in **long-term care**
- Patient dining and retail in **hospitals**
- Lunch service in **K-12** cafeterias
- Campus dining across **universities**
- Workplace food service in **corporate** settings
- Cleaning and infection-prevention rounds in **environmental services**
- Mechanical reliability in **plant operations**
- Linen turn and delivery in **laundry**
- Guest experience in **hospitality**

Different industries use different words — resident, patient, student, guest, customer. Different regulations apply. Different departments participate. The **structure of Operations** remains:

- A commitment in a time window.
- Readiness across people, equipment, supplies, knowledge, compliance, environment, communication.
- Execution with handoffs.
- Disruption as normal.
- Recovery as discipline.
- Success measured by service delivered, not paperwork filed.

The platform exists to make Operations **visible, coordinated, and resilient** — starting where the daily rhythm is most demanding and the compliance pressure is highest, and extending wherever organizations depend on getting physical work right, again and again, every day.

---

## Governance

- This document is the **primary conceptual reference** for feature discussion, alongside [PRODUCT_CONSTITUTION.md](./PRODUCT_CONSTITUTION.md).
- [DOMAIN_MODEL_TARGET.md](./DOMAIN_MODEL_TARGET.md) maps these concepts to platform entities.
- [FIRST_PRODUCT_SLICE.md](./FIRST_PRODUCT_SLICE.md) applies this model first to **Dietary Operational Mode**.
- Features that cannot be explained in terms of Operations require explicit justification.

---

## Related documents

- [PRODUCT_CONSTITUTION.md](./PRODUCT_CONSTITUTION.md) — principles
- [DOMAIN_MODEL_TARGET.md](./DOMAIN_MODEL_TARGET.md) — entity mapping
- [CURRENT_STATE_VS_TARGET_STATE.md](./CURRENT_STATE_VS_TARGET_STATE.md) — gap analysis
- [FIRST_PRODUCT_SLICE.md](./FIRST_PRODUCT_SLICE.md) — first operational slice
- [ARCHITECTURE_DECISION_LOG.md](./ARCHITECTURE_DECISION_LOG.md) — technical decisions
- [docs/architecture-review/](../architecture-review/) — current state assessment

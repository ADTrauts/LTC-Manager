# Operation Flow Reference — Breakfast Service

**Status:** Product reference — end-to-end operation walkthrough  
**Parent:** [00_PRODUCT_REFERENCE_INDEX.md](./00_PRODUCT_REFERENCE_INDEX.md)

**Reference operation:** Breakfast service, multi-location food service site.  
**Window:** 6:30–9:00 service; preparation from ~5:30.  
**Roles:** Manager (M), Supervisor (S), Employee (E), AI (A).

This walkthrough is **dietary as example**; the same flow structure applies to EVS rounds, laundry distribution, etc. with different milestones.

---

## Cast

| Location | Roles present |
|----------|---------------|
| Central kitchen | Cooks, porter lead |
| 4A Servery | Server Maria |
| 3B Servery | Server James |
| 2 North Servery | Floater after call-down |
| 5 West Retail | Server |

---

## Timeline

### 5:30 — Planning (mostly complete)

| Who | Product | Action |
|-----|---------|--------|
| M | *(prior day)* Review zone | Confirmed schedule published |
| System | — | Breakfast operation scheduled; locations inherit assignments |

*Product note:* Planning lives in Administration and Review — not morning open.

---

### 5:35 — Preparation begins

| Time | Who | Surface | Sees / does |
|------|-----|---------|-------------|
| 5:35 | M | Operations Center | Opens — **Breakfast · Preparation**. Site **At risk — 3 not ready** |
| 5:35 | A | Morning Brief (M) | "Breakfast prep underway. 4A blocked sanitizer. Call-down 2 North uncovered." |
| 5:36 | S | Today's Work → Walk list | 4A, 2 North, 3B top risk |
| 5:38 | E Maria | Unit Workspace 4A | Next: **Sanitizer check** — fails |
| 5:39 | E Maria | Report problem | Equipment — sanitizer dispenser — submits |
| 5:40 | S | Unit Workspace 4A | Sees blocked; initiates workaround checklist |
| 5:42 | M | Center drill 4A | Reads blocker; notifies S — stays Center |
| 5:45 | S | Coverage | Assigns floater Lisa → 2 North |
| 5:50 | E Lisa | Locations → 2 North | Banner: covering; sees opening checks |
| 5:55 | Kitchen E | Unit Workspace kitchen | Production checks; handoff milestone pending |

**Manager decisions:** Prioritize 4A vs call-down (both Tier 1 — 4A blocked wins). Delegate Lisa assignment to S.

**Supervisor decisions:** Walk order; workaround vs escalate sanitizer.

**Employee actions:** Complete checks; report failure; continue where safe.

---

### 6:00 — Preparation intensifies

| Time | Who | Surface | Sees / does |
|------|-----|---------|-------------|
| 6:00 | M | Center | **2 blocked → 1** (4A recovered). Call-down **covered** |
| 6:05 | S | Handoffs | Kitchen → porter **pending** — taps remind |
| 6:10 | E James | 3B Workspace | Marks **meal ready** milestone |
| 6:15 | M | Center | Location grid — 12 ready, 2 in progress |
| 6:20 | S | 3B visit | Warmer intermittent — reports issue; workaround active |
| 6:25 | Porter | Handoffs | Confirms pickup — kitchen row green |

**AI (M):** "Handoff still pending — kitchen. 3B at risk warmer."

**Recovery:** 3B degraded not blocked — documented workaround.

---

### 6:30 — Execution begins

| Time | Who | Surface | Sees / does |
|------|-----|---------|-------------|
| 6:30 | System | All | Phase → **Execution** |
| 6:30 | M | Center | Pulse **Healthy — 1 at risk** (3B) |
| 6:32 | E Maria | 4A | **Mark meal started** |
| 6:35 | E Lisa | 2 North | In-service temp check promoted |
| 6:40 | S | Walk list | Spot-check 5 West — supply OK |
| 6:50 | M | Center | Glance only — no drill |
| 7:00 | E James | 3B | In-service check — pass |

**Manager decisions:** Accept 3B degraded — yes at 6:28.

**Supervisor decisions:** Rotation 4A → 2N → 5W → kitchen door.

---

### 7:15 — Mid-execution disruption

| Time | Who | Surface | Sees / does |
|------|-----|---------|-------------|
| 7:15 | E 5W | Workspace | Reports **supply short — domes** |
| 7:16 | M | Center exception | Supply at 5W — at risk |
| 7:18 | S | 5W | Confirms substitute procedure — recovery note |
| 7:20 | M | Acknowledge | Degraded accepted; Center updated |

**Recovery pattern:** Report → visibility → workaround → acknowledge.

---

### 8:30 — Overlap / support

| Time | Who | Surface | Sees / does |
|------|-----|---------|-------------|
| 8:30 | System | — | Lunch **Preparation** starts (overlap) |
| 8:30 | M | Center | **What's next** panel — lunch prep readiness kitchen |
| 8:35 | Kitchen | Workspace | Shift toward lunch production |
| 8:45 | S | Walk list | Breakfast locations **closing** checks promote |

**Product:** Two operations visible — breakfast execution closing + lunch preparation.

---

### 8:45–9:00 — Transition

| Time | Who | Surface | Sees / does |
|------|-----|---------|-------------|
| 8:50 | E Maria | 4A | Close-out checklist |
| 8:55 | M | Center | Breakfast **Closing** — 2 locations open close-out |
| 9:00 | System | — | Breakfast **complete** (or partial with note) |
| 9:00 | A | Shift transition (M+S) | "Breakfast complete. 3B warmer follow-up open. Lunch prep on track." |

**Transition carries:** Open plant ticket 3B; lunch staffing gap at 5W (if any).

---

### 9:05 — Manager leaves Center?

Breakfast operation **closed** on Center. Manager may:

- Stay for lunch prep monitoring
- Delegate to S
- Open Review briefly — not required

**Supervisor:** Lunch walk list becomes primary.

---

## Phase summary table

| Phase | Center focus | Walk list focus | Workspace focus |
|-------|--------------|-----------------|-----------------|
| Preparation | Blocked, call-downs | Risk order visits | Opening checks |
| Execution | At-risk, milestones | Spot checks | In-service work |
| Recovery | Exception stack | Issue response | Report + continue |
| Transition | What's next | Close-out | Shutdown checks |

---

## AI touchpoints (this operation)

| Moment | AI role |
|--------|---------|
| 5:35 open | Morning Brief |
| 6:05 | Handoff nudge |
| 6:28 | Degraded decision support |
| 9:00 | Shift transition summary |
| On demand | "How is breakfast going?" |

---

## Product invariant demonstrated

One operation — **multiple surfaces**, **shared state**, **no module hopping**.

Logs, staffing, issues, milestones are **work items in Unit Workspace** and **exceptions on Center** — not separate morning rituals.

---

## Related documents

- [02_OPERATIONS_CENTER_REFERENCE.md](./02_OPERATIONS_CENTER_REFERENCE.md)
- [04_SUPERVISOR_REFERENCE.md](./04_SUPERVISOR_REFERENCE.md)
- [08_AI_EXPERIENCE_REFERENCE.md](./08_AI_EXPERIENCE_REFERENCE.md)

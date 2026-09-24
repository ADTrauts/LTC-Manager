# Capability: Issue and Recovery

**Capability ID:** CAP-04  
**Parent:** [00_REFERENCE_CAPABILITIES_INDEX.md](./00_REFERENCE_CAPABILITIES_INDEX.md)

---

## Purpose

**Detect, communicate, recover from, and learn from** operational disruption — treating variance as normal, not exceptional.

This capability ensures operations **continue or close honestly** when the plan breaks.

---

## Operational promise

When something goes wrong, the organization **sees it early**, **responds in the open**, **records enough to coordinate**, and **captures lessons** — without shame, radio-only coordination, or silent failure.

Recovery is as disciplined as execution.

---

## Inputs

- **Reports from floor** — anyone can signal problem at location.
- **Failed readiness gates** — compliance, equipment, environment.
- **Staffing disruptions** — call-offs, no-shows.
- **Supply signals** — shortage at point of use.
- **External events** — survey, delivery failure, census change, facility event.
- **Automated detection** (future) — missed milestone, overdue handoff.
- **Escalations** — supervisor → manager decisions.

---

## Outputs

- **Issues** — classified problems with location, operation, severity, impact.
- **Recovery actions** — coverage, workaround, scope reduction, delay, escalate.
- **Recovery state** — at risk → recovering → recovered → healthy.
- **Escalation record** — decisions above floor authority.
- **Communication notes** — who was informed (nursing, diet office, customers).
- **Follow-up work** — plant repair, supply order, training need.
- **Lessons learned** — attached to issue, location, or operation for knowledge capability.

---

## Issue domains

### Equipment

Asset failure or degradation threatening operation — warmer down, dish machine, chiller, elevator for carts.

### Supply

Shortage or wrong delivery affecting service — domes, chemicals, ingredients.

### Environment

Space unusable or wrong status — spill, terminal clean pending, construction, weather access.

### Safety

Condition requiring stop or immediate intervention — food safety, slip hazard, fire system.

### Communication

Handoff failure, wrong assumption, missing coordination — operationally harmful even without physical break.

---

## Recovery dimensions

| Action | Purpose |
|--------|---------|
| **Reassign** | Move people to close gap |
| **Workaround** | Temporary alternate process — documented, time-bounded |
| **Reduce scope** | Simplified service — honest partial commitment |
| **Delay** | Hold service until safe — blocked state |
| **Escalate** | Manager decision — stop, authorize risk, allocate resources |
| **Follow-up** | Defer non-urgent work; queue permanent fix |
| **Communicate** | Inform affected parties |

---

## Escalation

When floor or supervisor authority is insufficient:

- **Escalated** state distinct from **blocked** — ownership at manager level.
- Decision and outcome recorded.
- Operation may proceed, stop, or run degraded per decision.

---

## Lessons learned

When issues close:

- What worked in recovery?
- What repeats at this location?
- Feeds **Operational Knowledge** and **Analytics**.

Not a blame archive — a **teaching capture**.

---

## Users

| User | Role |
|------|------|
| **Employee** | Report; apply workaround; continue when safe |
| **Supervisor** | First response; initiate recovery |
| **Manager** | Escalation; scope decisions |
| **Support** | Plant, supply, clinical — resolve domain issues |

---

## Relationships

| Capability | Relationship |
|------------|--------------|
| **Operation Readiness** | Issues block or degrade readiness |
| **Operation Execution** | Recovery interleaves with execution |
| **Workforce and Coverage** | Staffing recovery overlaps |
| **Asset and Location** | Equipment issues link to assets |
| **Supply and Resources** | Supply issues link to resources |
| **Operational Knowledge** | Lessons feed knowledge |
| **Operational Intelligence** | Open issues drive awareness |
| **Analytics** | Recurring issues inform improvement |

---

## Operational rules

1. **Reporting is safe** — fastest reporter is not the problem.
2. **Impact stated plainly** — "cannot hold hot food" not only "warmer fault."
3. **Recovery visible** — recovered ≠ never happened.
4. **Severity matches operation** — same break differs by meal timing.
5. **Open until closed** — issues affecting today stay visible until resolved or handed off.
6. **Cross-department routing** — requesting vs responsible department clear.
7. **Preventive linkage** — chronic equipment issues connect to asset history.

---

## Success criteria

| Criterion | Measure |
|-----------|---------|
| **Early detection** | Issues surfaced before customer impact when possible |
| **Coordinated response** | Ownership clear; no duplicate radio threads |
| **Service preserved** | Recovery saves commitment when safe to do so |
| **Honest closure** | Partial success recorded, not fake green |
| **Learning loop** | Repeat issues decrease over time |

---

## Future extensibility

- **Issue taxonomy** per industry — clinical isolation, allergen alert, VIP change.
- **SLA targets** — plant response expectations by severity.
- **Automatic escalation** — unanswered critical issue timers.
- **Customer/resident notification** hooks where appropriate.
- **Insurance/regulatory** incident classification — industry pack, not core.

---

## Industry examples

| Industry | Typical issue → recovery |
|----------|-------------------------|
| LTC | Warmer down → simplified hot line from backup |
| Hospital | Elevator out → tray reroute delay communicated |
| K-12 | Cooler fail → line closed, redirect students |
| University | Rush short staff → cross-station pull |
| Corporate | Delivery short → substitute SKU |
| EVS | Isolation surge → reprioritize zone order |
| Plant | Chiller alarm → kitchen hold until cleared |
| Laundry | Dryer down → redistribute turn priority |
| Hospitality | VIP late change → menu scope adjust |

---

## Experience alignment

Surfaces through [Operational Recovery](../reference-ux/07_OPERATIONAL_RECOVERY.md), [Operations Center](../reference-ux/01_OPERATIONS_CENTER.md), and [Unit Workspace](../reference-ux/02_UNIT_WORKSPACE.md).

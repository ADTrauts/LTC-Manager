# Capability: Workforce and Coverage

**Capability ID:** CAP-03  
**Parent:** [00_REFERENCE_CAPABILITIES_INDEX.md](./00_REFERENCE_CAPABILITIES_INDEX.md)

---

## Purpose

Ensure the **correct people are in the correct place** with the **correct role** for each operation — and adapt when reality diverges from plan.

Workforce capability connects **people** to **operations** and **locations**.

---

## Operational promise

The organization always knows **who should be where**, **who actually is where**, and **where gaps exist** — and can **close gaps** through assignment, floaters, overrides, and call-downs without losing the thread of service.

---

## Inputs

- **Roster** — people available to work, skills, departments, employment status.
- **Standing assignments** — default patterns ("usually server at 4A").
- **Schedule plan** — who is planned where, when, in what role for the operation window.
- **Operation demand** — locations and roles required for active/upcoming operations.
- **Absences and call-offs** — people who will not be present as planned.
- **Cross-department availability** — floaters, borrowed staff, agency (conceptually).
- **Policy** — union rules, seniority, minimum staffing (industry pack).

---

## Outputs

- **Coverage map** — people × locations × roles for operation window.
- **Coverage gaps** — locations or roles without assigned person.
- **Assignments** — confirmed placement for execution.
- **Call-downs** — open coverage requests with status.
- **Overrides** — day-of changes with reason.
- **Cross-coverage record** — temporary placement affecting multiple locations.
- **Role awareness** — what role each person is performing **for this operation** (may differ from job title).

---

## Core concepts

### Assignments

Standing and planned linkage of **person → location → role → operation window**.

### Coverage

Whether **required roles are filled** at each location for the operation.

### Call-downs

**Operational request** for replacement coverage when someone cannot work — distinct from HR absence processing.

### Floaters

People **not fixed to one location** — deployed to close gaps.

### Overrides

**Day-of change** to plan — reassign, swap, pull from another station.

### Cross coverage

Person **temporarily covers** a location outside their usual assignment — both places need visible state.

### Role awareness

Floor and supervisor see **operational role now** — server, cook, porter — not only HR classification.

### Operational impact

Staffing gaps express as **readiness and health** — uncovered servery = at risk or blocked.

---

## Users

| User | Workforce actions |
|------|-------------------|
| **Manager** | Approve call-downs; resolve site-wide gaps; escalate agency |
| **Supervisor** | Reassign; deploy floaters; initiate call-down |
| **Employee** | See where working today; acknowledge coverage assignment |
| **Scheduler** (role) | Build plan — may be manager in smaller sites |

---

## Relationships

| Capability | Relationship |
|------------|--------------|
| **Operation Readiness** | Staffing is primary readiness input |
| **Operation Execution** | Provides participants for milestones |
| **Issue and Recovery** | Call-offs trigger recovery; coverage is recovery action |
| **Operational Intelligence** | Surfaces gaps and open call-downs |
| **Analytics** | Absenteeism patterns, chronic understaffed locations |
| **Operational Knowledge** | Floater briefings for unfamiliar locations |

---

## Operational rules

1. **Coverage is operation-scoped** — lunch staffing ≠ dinner staffing.
2. **Unanswered call-down is open risk** — stays visible until covered or accepted.
3. **Override requires reason** — supports learning, not blame.
4. **Cross-coverage updates both locations** — donor and receiver state.
5. **Plan is intent; floor is truth** — system tracks variance honestly.
6. **PIN/floor identity** respects placement — employee sees assignment context.
7. **HR depth is modular** — roster compliance (credentials, union) may extend without redefining coverage.

---

## Success criteria

| Criterion | Measure |
|-----------|---------|
| **Gap visibility** | Uncovered locations known before service |
| **Resolution speed** | Call-down to coverage confirmation tracked |
| **Floor clarity** | Employee knows where and as what role |
| **Recovery link** | Staffing actions recover operations, not only schedules |
| **Fairness** | Policy respected where configured — industry pack |

---

## Future extensibility

- **Skills-based matching** — "need cook-capable floater."
- **Agency integration** — external worker as coverage source.
- **Cross-site float pool** — operator-level shared staff (multi-site maturity).
- **Predictive staffing** — chronic gap locations flagged from analytics.
- **Union workflow** — seniority-ordered call lists per industry pack.

---

## Industry examples

| Industry | Coverage question |
|----------|-------------------|
| LTC | Who is on 4A servery for breakfast? |
| Hospital | Who covers nourishment room 3 North? |
| K-12 | Who is on each lunch line? |
| University | Who floats between retail and dining hall at rush? |
| Corporate | Who opens markets across floors? |
| EVS | Who owns zone cluster this round? |
| Plant | Who is on-call for kitchen mechanical today? |
| Laundry | Who staffs distribution for evening turn? |
| Hospitality | Who is on banquet service vs prep? |

---

## Experience alignment

Surfaces through [Operations Center](../reference-ux/01_OPERATIONS_CENTER.md), [Supervisor Workspace](../reference-ux/03_SUPERVISOR_WORKSPACE.md), and [Operational Recovery](../reference-ux/07_OPERATIONAL_RECOVERY.md).

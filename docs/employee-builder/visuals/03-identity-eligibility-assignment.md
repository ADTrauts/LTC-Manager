# Visual 3 — Identity, eligibility, and today's assignment

**Label:** proposed path for one person. Qualification is the step the code does not have yet.

```mermaid
sequenceDiagram
  participant HR as Employee Builder
  participant SCH as Schedule
  participant RUN as Run
  participant REV as Review

  HR->>HR: Create Employee John Smith
  HR->>HR: Job title Dietary Aide
  HR->>HR: RoleKey STAFF
  HR->>HR: Member of Food and Nutrition
  HR->>HR: Primary team Resident Services
  Note over HR: Missing today: qualify SERVER and DISHWASHING
  SCH->>SCH: Shift Tuesday 10:30–19:00 Food and Nutrition
  Note over SCH: Shift does not store SERVER
  RUN->>RUN: Assignment SERVER, 1A Servery, Lunch
  Note over RUN: Home team stays Resident Services
  REV->>REV: Read roleKey SERVER and snapshotted roleLabel
```

| Fact | John's value | Store today | Changes when he covers dishroom today? |
|---|---|---|---|
| HR title | Dietary Aide | `JobTitle` | No |
| Platform authority | STAFF | `RoleKey` | No |
| Home team | Resident Services | `EmployeeTeamMembership.isPrimary` | No |
| Qualified roles | SERVER, DISHWASHING | Not stored | No |
| Shift | Tuesday afternoon | `ScheduleEntry` | No |
| Today | SERVER at 1A, Lunch | `OperationalAssignment` | The assignment is the change |

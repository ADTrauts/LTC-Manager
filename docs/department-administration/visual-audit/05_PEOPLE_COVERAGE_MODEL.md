# Visual 5 — People / Team / Role / Coverage

Phase 7B is the current picture. Team is an organizational grouping. Operational eligibility is a qualification on the shared registry. Role is not nested under Team. Department Job Role is removed. The diagrams below that still draw a Job Role or a Team → Role → Employee database tree are the November 1 proposal that was not adopted as a schema.

## Team after Phase 5A

```text
Department
  → Team
      name
      description
      managerEmployeeId    this person leads the Team
                           does not grant platform authority
      EmployeeTeamMembership
```

A Team does not own a room, a Location Function, a cycle, a coverage count, or a viewer's authorization. Department responsibility is the footprint. Coverage is the staffing need. `OperationalAssignment` is today's placement. Authorization stays on policy and role.

The earlier room membership, operational-type keys, and team-cycle tables are dropped. Location Program does not label a room with a Team.

## Historical: Role was not one thing

The drawing below is the overlap Phase 7B removed. Nothing in the surviving schema places a role under `DepartmentTeam`.

```mermaid
flowchart TB
  DEPT["Department"]

  DEPT --> TEAM["DepartmentTeam<br/>People and Coverage tab"]
  DEPT --> JOB["DepartmentJobRole<br/>/employees/job-roles<br/>DUP second workforce model"]
  DEPT --> ASN["Assignment role catalog<br/>COOK, SERVER, DISHWASHING, …<br/>src/lib/scheduling/assignment-roles<br/>DUP third workforce vocabulary"]
  DEPT --> TITLE["JobTitle<br/>HR title on Employee"]
  DEPT --> AUTH["RoleKey on Employee<br/>platform authority<br/>this one should stay separate"]

  TEAM --> MEM["EmployeeTeamMembership"]
  JOB --> EJR["EmployeeDepartmentJobRole<br/>one active role per employee per Department<br/>tier TEAM_MEMBER / LEAD / SUPERVISOR / MANAGER<br/>capability keys<br/>service says: does not change RoleKey or Run"]
  ASN --> OA["OperationalAssignment.roleKey<br/>and coverage template items<br/>this is what Coverage counts"]

  MEM --> EMP["Employee"]
  EJR --> EMP
  TITLE --> EMP
  AUTH --> EMP
  OA --> EMP

  classDef dup fill:#fdecec,stroke:#9b2c2c,color:#1a2114
  classDef keep fill:#e7f6ec,stroke:#1f7a3a,color:#1a2114
  classDef person fill:#e8f1fb,stroke:#1d4e89,color:#1a2114
  class TEAM,JOB,ASN,EJR dup
  class AUTH,OA,EMP keep
  class DEPT,MEM,TITLE person
```

Those Job Role tiers and capability keys are deleted. Cook and Server remain registry roles. Coverage counts `OperationalAssignment.roleKey`. Schedule, Team, and Job Title do not fill a slot.

Leadership that remains: the Department head, `DepartmentStaffManager`, and `DepartmentTeam.managerEmployeeId`. Membership has no role column.

## Current: one configured need, then a derived answer

```text
TEAM CYCLE — retired in Phase 5A
    DepartmentTeamCycle is dropped
    a Team does not run a cycle
    a Team does not store requiredCount or coverage grain

COVERAGE NEED — the one configuration
    OperationalAssignmentTemplate + OperationalAssignmentTemplateItem
    Department on the template
    roleKey from the operational assignment catalog
    spaceId for a room; unitId only for a non-room Unit question
    period cycle stable keys
    requiredCount
    draft / published / effective dates
    Location Function keys are ignored
    Team requiredCount is not written and is not evaluated

ACTUAL
    OperationalAssignment for the service date
    same roleKey, location cover, and cycle-window overlap
    ScheduleEntry and Team membership do not fill a slot
    a call-down on the assignment keeps the fill and marks the slot at risk

ANSWER
    derived Coverage state
    grain: department + service date + canonical location + role + period
    there is no CoverageEpisode table
    the derived state is not stored as the requirement
```

**Phase 4.** Need B is the surviving configuration. Need A is an organizational cycle link with no staffing count.

## Not adopted: a database tree of Team then Role

The tree below was the November 1 sketch. It is a presentation example, not the schema. Lead Server and Prep Cook are not registry roles. Cook, Server, Cashier, and Barista are qualifications, not children of a Team.

```mermaid
flowchart TB
  EB["Employee Builder owns this tree"]
  DEPT["Food and Nutrition"]
  EB --> DEPT

  DEPT --> CUL["Team · Culinary"]
  DEPT --> RS["Team · Resident Services"]
  DEPT --> UTL["Team · Utility"]
  DEPT --> RET["Team · Retail"]

  CUL --> C1["Role · Cook"]
  CUL --> C2["Role · Prep Cook"]
  CUL --> C3["Role · Baker"]

  RS --> R1["Role · Server"]
  RS --> R2["Role · Lead Server"]

  UTL --> U1["Role · Dishwasher"]
  UTL --> U2["Role · Porter"]
  UTL --> U3["Role · Receiver"]

  RET --> T1["Role · Cashier"]
  RET --> T2["Role · Barista"]

  C1 --> E1["Employee"]
  R1 --> E2["Employee"]

  classDef own fill:#e7f6ec,stroke:#1f7a3a,color:#1a2114
  classDef org fill:#e8f1fb,stroke:#1d4e89,color:#1a2114
  class EB,DEPT own
  class CUL,RS,UTL,RET,C1,C2,C3,R1,R2,U1,U2,U3,T1,T2,E1,E2 org
```

```text
Employee Builder

Department
    ↓
Team
    ↓
Role
    ↓
Employee

Food & Nutrition
├── Culinary
│   ├── Cook
│   ├── Prep Cook
│   └── Baker
├── Resident Services
│   ├── Server
│   └── Lead Server
├── Utility
│   ├── Dishwasher
│   ├── Porter
│   └── Receiver
└── Retail
    ├── Cashier
    └── Barista
```

What was kept from that sketch:

- Team identity does not own physical rooms.
- Team identity is not Coverage.
- `RoleKey` stays governance. It is not a job Role.
- Department Builder → People & Coverage reads the workforce and shows coverage. It does not become a second authoring home.

What was not kept: a database child Role under the Team, Lead Server, Prep Cook, and Department Job Role capabilities. Eligibility is `EmployeeOperationalRoleQualification` on `OPERATIONAL_ROLE_REGISTRY`.

## Proposed: Coverage is derived

```mermaid
flowchart TB
  NEED["Configured coverage need<br/>separate from Team identity"]
  SHIFT["Shift<br/>ScheduleEntry<br/>who is scheduled"]
  CALLOFF["Call-offs"]
  DAY["Daily Assignment<br/>OperationalAssignment<br/>where and as what role today"]

  NEED --> COV["Coverage<br/>derived answer<br/>not a field on Team"]
  SHIFT --> COV
  CALLOFF --> COV
  DAY --> COV

  classDef cfg fill:#e8f1fb,stroke:#1d4e89,color:#1a2114
  classDef out fill:#e7f6ec,stroke:#1f7a3a,color:#1a2114
  class NEED,SHIFT,CALLOFF,DAY cfg
  class COV out
```

```text
configured coverage need
        +
Shift
        +
Call-offs
        +
Daily Assignment
        ↓
Coverage
```

Department Builder may show the result on a Facility card. Editing the need stays with coverage configuration. Editing the person stays with Employee Builder. Editing today’s placement stays with Assignment.

# Visual 2 — Proposed organizational architecture

**Label:** proposed. Not an approved schema.

The screen can look like Department → Team → people, with roles beside the people. The database should not make the operational role a child of the team.

```mermaid
flowchart TB
  DEPT[Department Food and Nutrition]
  CUL[Team Culinary]
  RES[Team Resident Services]
  EMP[Employee John Smith]
  TITLE[Job title Dietary Aide]
  AUTH[RoleKey STAFF]
  Q1[Qualified SERVER]
  Q2[Qualified DISHWASHING]
  REG[OPERATIONAL_ROLE_REGISTRY]
  HOME[Primary membership Resident Services]
  ALSO[Also a member of Culinary when that is true]

  DEPT --> CUL
  DEPT --> RES
  EMP --> TITLE
  EMP --> AUTH
  EMP --> HOME
  HOME --> RES
  EMP --> ALSO
  ALSO --> CUL
  EMP --> Q1
  EMP --> Q2
  Q1 --> REG
  Q2 --> REG
```

Many-to-many that must stay:

- One employee, many Departments.
- One employee, many teams in a Department, one primary.
- One employee, many registry roles in a Department.
- One team, many employees.
- One registry role, many employees, and no required team.

Do not add a Role row that exists only under Culinary. `COOK` exists because the platform catalog says so. People on Culinary may be qualified for it.

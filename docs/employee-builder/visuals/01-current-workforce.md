# Visual 1 — Workforce architecture

**Label:** current after Phase 7B. November 4, 2026.

```mermaid
flowchart TB
  subgraph person [One Employee]
    E[Employee]
  end

  subgraph auth [Platform authority]
    RK[RoleKey on Employee.roleType]
    RP[UserFacilityRolePeriod]
  end

  subgraph hr [HR identity]
    JT[JobTitle]
    JC[JobClassification]
  end

  subgraph org [Organization]
    ED[EmployeeDepartment plus primary department]
    TM[DepartmentTeam]
    MEM[EmployeeTeamMembership one primary per Department]
    LEAD[Team.managerEmployeeId]
    HEAD[Department.headEmployeeId]
    SM[DepartmentStaffManager]
  end

  subgraph ops [Operational eligibility and placement]
    REG[OPERATIONAL_ROLE_REGISTRY]
    QUAL[EmployeeOperationalRoleQualification]
    COV[Coverage template item roleKey]
    OA[OperationalAssignment roleKey and roleLabel]
    EX[Eligibility exception event]
  end

  subgraph time [Schedule]
    SE[ScheduleEntry when they work]
  end

  E --> RK
  RK --> RP
  E --> JT
  E --> JC
  E --> ED
  E --> MEM
  MEM --> TM
  TM --> LEAD
  E --> HEAD
  E --> SM
  E --> QUAL
  QUAL --> REG
  REG --> COV
  REG --> OA
  E --> OA
  OA --> EX
  E --> SE
```

Department Job Role, Default Assignment, EmployeeWorkStation, `EmployeeDepartment.roleType`, and `ScheduleEntry.roleType` / `unitId` are removed. A qualification does not grant RoleKey. A Team lead does not grant RoleKey. An exception does not create a qualification.

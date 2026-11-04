# Visual 1 — Current workforce architecture

**Label:** current. November 4, 2026.

Overlapping stores are the boxes that all claim to say what a person "is."

```mermaid
flowchart TB
  subgraph person [One Employee]
    E[Employee]
  end

  subgraph auth [Platform authority — KEEP]
    RK[RoleKey on Employee.roleType]
    RP[UserFacilityRolePeriod]
  end

  subgraph hr [HR — KEEP]
    JT[JobTitle]
    JC[JobClassification]
  end

  subgraph org [Organization — KEEP]
    ED[EmployeeDepartment plus primary department]
    TM[DepartmentTeam]
    MEM[EmployeeTeamMembership isPrimary]
    LEAD[Team.managerEmployeeId]
    HEAD[Department.headEmployeeId]
    SM[DepartmentStaffManager]
  end

  subgraph job [Department Job Role — overlaps authority]
    DJR[DepartmentJobRole tier plus capabilities]
    EDJR[EmployeeDepartmentJobRole one per Department]
  end

  subgraph ops [Operations — KEEP one catalog]
    REG[OPERATIONAL_ROLE_REGISTRY]
    COV[Coverage template item roleKey]
    OA[OperationalAssignment roleKey and roleLabel]
  end

  subgraph legacy [Unused or demoted]
    WS[EmployeeWorkStation]
    DA[DefaultAssignment RoleKey plus unit]
    SR[ScheduleEntry.roleType and unitId]
    DORM[EmployeeDepartment.roleType dormant]
  end

  E --> RK
  E --> JT
  E --> JC
  E --> ED
  E --> MEM
  MEM --> TM
  TM --> LEAD
  E --> HEAD
  E --> SM
  E --> EDJR
  EDJR --> DJR
  REG --> COV
  REG --> OA
  E --> OA
  E --> WS
  E --> DA
  E --> SR
  ED --> DORM
```

`DepartmentJobRole` uses the words Lead, Supervisor, and Manager, and stores capability strings that look like permissions. Run and the policy engine do not read them. `WorkStation` names Cook and Server again. The assignment form ignores both and uses the registry.

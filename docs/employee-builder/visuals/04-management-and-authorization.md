# Visual 4 — Management and authorization

**Label:** current facts, with the proposed rule that they stay separate.

```mermaid
flowchart LR
  subgraph org [Organizational leadership]
    HEAD[Department head]
    LEAD[Team lead]
    GRANT[Staff-manager grant]
  end

  subgraph plat [Platform authority]
    RK[RoleKey]
    POL[Route and write policy]
  end

  subgraph notauth [Does not authorize]
    QUAL[Qualified operational role]
    ASN[Today's assignment role]
    TITLE[Job Title]
  end

  HEAD -->|accountable for the Department| DEPT[Department]
  LEAD -->|leads people| TEAM[Team]
  GRANT -->|only if RoleKey is already MANAGER| POL
  RK --> POL
  QUAL -.->|must not imply| POL
  ASN -.->|must not imply| POL
  TITLE -.->|must not imply| POL
```

A team lead does not become `RoleKey.MANAGER`. A Department head does not become `FACILITY_ADMINISTRATOR`. Qualifying someone for `SERVER` does not add a management route. The staff-manager grant is the only intentional delegation, and it requires the platform role first.

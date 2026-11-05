# Visual 5 — Coverage and assignment

**Label:** current, and the proposed qualification link. Coverage already uses the registry. Qualification does not exist yet.

```mermaid
flowchart LR
  REG[OPERATIONAL_ROLE_REGISTRY key SERVER]
  QUAL[Employee qualification SERVER]
  COV[Coverage item space 1A roleKey SERVER count 2 Lunch]
  ASN[OperationalAssignment roleKey SERVER roleLabel Server]
  TEAM[Primary team Resident Services]

  REG --> COV
  REG --> QUAL
  QUAL -.->|proposed filter, not a second key| ASN
  REG --> ASN
  TEAM -.->|caption only| COV
  ASN -->|fills| COV
```

The coverage row does not store a team id or an employee id. The assignment stores the person, the place, the key, and the label. Review reads the assignment snapshot. Renaming the registry label later does not rewrite that snapshot.

Team is not how Coverage finds the room. Facility responsibility and the explicit `spaceId` do that.

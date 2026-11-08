# Visual 2 — Data ownership

**Current architecture.** Each box is a fact that already has an owner. People & Coverage should read the first three and write only Coverage configuration.

```mermaid
flowchart LR
  subgraph eb [Employee Builder]
    ID["Identity and Job Title"]
    MEM["Department membership"]
    TEAM["Team, lead, primary Team"]
    QUAL["Operational qualification"]
  end
  subgraph db [Department Builder]
    NEED["Coverage requirement<br/>room, role, period, count"]
  end
  subgraph run [Run]
    ASN["OperationalAssignment"]
    SHIFT["ScheduleEntry<br/>planned time and call-off"]
  end
  subgraph rev [Review]
    HIST["Historical Coverage"]
  end
  AUTH["RoleKey<br/>platform authorization"]

  TEAM -->|does not fill| NEED
  QUAL -->|does not fill| NEED
  SHIFT -->|does not fill| NEED
  ASN -->|fills| NEED
  NEED -->|published need| ASN
  ASN --> HIST
  NEED --> HIST
  AUTH -.->|does not follow the Team lead| TEAM
```

Department → Team → Role → Employee is a way to read the workforce. It is not a database tree. A qualification is not a child of a Team. A Team lead is not a RoleKey.

```mermaid
flowchart TB
  DEPT["Selected Department"]
  DEPT --> H["Department head"]
  DEPT --> T1["Team · Resident Services<br/>primary for some members"]
  DEPT --> T2["Team · Utility"]
  DEPT --> NONE["Members with no Team"]
  PERSON["One employee"]
  T1 --> PERSON
  T2 -->|additional Team| PERSON
  PERSON --> Q1["Qualified · Server"]
  PERSON --> Q2["Qualified · Dishwashing"]
  PERSON --> TODAY["Today's Assignment<br/>may be a different room"]
```

The second drawing is the composition the screen does not assemble today. The Team editor on People & Coverage currently writes the Team and the lead. Membership and qualifications are written in Employee Builder.

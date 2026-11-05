# What we are actually removing

November 2, 2026 supersedes the November 1 keep-list for Location Function. The dependency trace is [08 — Location Function elimination audit](./08_LOCATION_FUNCTION_ELIMINATION_AUDIT.md). Nothing in production code has been deleted.

```mermaid
flowchart LR
  subgraph keep ["Keep"]
    K1["Facility tree"]
    K2["Physical classification"]
    K3["Department responsibility"]
    K4["Operating Rhythm with explicit places"]
    K5["Records with explicit targets"]
    K6["Employee, Team, Role"]
    K7["Coverage"]
    K8["Assets"]
    K9["Menus"]
    K10["Plant requests, issues, work orders, PM"]
  end

  subgraph move ["Move or consolidate"]
    M1["Teams to Employee Builder"]
    M2["Roles to Employee Builder"]
    M3["Coverage need onto canonical locations"]
  end

  subgraph retire ["Retire"]
    R1["Location Function"]
    R2["Operational Type"]
    R3["Archetype and bindings"]
    R4["Department operational profile"]
    R5["Experiences and Operational Areas"]
    R6["Generic Work and its presets"]
    R7["Team-owned rooms and function keys"]
    R8["Implicit room-type log defaults"]
  end

  classDef keep fill:#e7f6ec,stroke:#1f7a3a,color:#1a2114
  classDef move fill:#e8f1fb,stroke:#1d4e89,color:#1a2114
  classDef retire fill:#fdecec,stroke:#9b2c2c,color:#1a2114
  class K1,K2,K3,K4,K5,K6,K7,K8,K9,K10 keep
  class M1,M2,M3 move
  class R1,R2,R3,R4,R5,R6,R7,R8 retire
```

## Keep

Facility physical tree, Facility Room Type, and Department responsibility. Operating Rhythm, with participation stored as location ids or department-wide. The Records engine, aimed at a facility, department, unit, space, or asset. Employee, Team, and Role as workforce concepts. Coverage as a derived answer. Assets. Menus. Plant requests, issues, work orders, and preventive maintenance.

Effective dating stays on the owner that has a real history question: the cycle, the record attachment, the coverage template, the menu. It does not stay on a Department room-classification profile.

## Move / consolidate

Teams and Roles move to Employee Builder. Coverage need becomes configuration that names canonical locations, a role, a count, and a cycle when the need is cycle-bound. It does not name a Location Function.

## Retire

Location Function, Operational Type, `DepartmentRoomArchetype`, its bindings, and `DepartmentOperationalProfile` when nothing else needs the profile. Operational Areas, the Experience catalog, area experiences, archetype experiences, and room exceptions. Generic Work, Work Plans, Expected Work, Work occurrences, and Work presets. Team-owned room programming, including operational-type keys on teams. Implicit Facility-type log defaults.

## Dependency proof required

Only the consumers that still expand a key at read time. Dropping the tables before they stop will mis-resolve cycles, records, audit, coverage, team scope, and experience projection. The audit names those files. Code volume is not itself a hold.

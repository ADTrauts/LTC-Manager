# Visual 2 — Proposed Department Builder architecture

Source: November 1, 2026 decision in [16 — Department Builder Architecture](https://github.com/ADTrauts/LTC-Manager/blob/architecture/department-builder-facility-reconciliation/docs/product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md) and the Facility audit on the same branch. This is the target. It is not what the tab bar does today.

## Core shell and product extensions

```mermaid
flowchart TB
  DB["Department Builder<br/>configuration hub for one installed Department<br/>How does this Department operate in this facility?"]

  subgraph core ["Same five sections for every Department"]
    OV["Overview<br/>READ only"]
    FAC["Facility<br/>READ of responsible places<br/>no Department room classification"]
    RHY["Operating Rhythm<br/>CANON timing"]
    PPL["People and Coverage<br/>READ of Employee Builder<br/>plus coverage"]
    REC["Records<br/>CANON engine, Department surface"]
  end

  subgraph ext ["Product extensions — only when the capability is real"]
    MNU["Food and Nutrition<br/>Menus"]
    PM["Facility Plant Operations<br/>Preventive Maintenance"]
    EVS["Environmental Services<br/>no extension defined"]
  end

  DB --> OV
  DB --> FAC
  DB --> RHY
  DB --> PPL
  DB --> REC
  DB --> MNU
  DB --> PM
  DB --> EVS

  GONE["Work section<br/>removed<br/>do not rebuild as Task, Activity, Duty, or Routine"]

  classDef core fill:#e7f6ec,stroke:#1f7a3a,color:#1a2114
  classDef ext fill:#e8f1fb,stroke:#1d4e89,color:#1a2114
  classDef gone fill:#fdecec,stroke:#9b2c2c,color:#1a2114
  class OV,FAC,RHY,PPL,REC core
  class MNU,PM,EVS ext
  class GONE gone
```

```text
Department Builder
├── Overview
├── Facility                  ← today's Locations
├── Operating Rhythm
├── People & Coverage
└── Records

Food & Nutrition
└── Menus

Facility Plant Operations
└── Preventive Maintenance    ← today's Maintenance route

Work                        removed
```

**Repo vs November 1.** Today’s bar still inserts Work, still says Locations, and says Maintenance. All three products still declare `workPresets: true`, which is why Work appears.

## Ownership boundaries

Department Builder may show a fact. Showing it does not make Department Builder the author.

```mermaid
flowchart LR
  FB["Facility Builder<br/>CANON<br/>physical hierarchy<br/>Department responsibility"]
  EB["Employee Builder<br/>CANON<br/>Department → Team → Role → Employee"]
  DBb["Department Builder<br/>composes and configures<br/>how the Department operates"]
  RUN["Run<br/>CANON for today<br/>published Cycle and Phase<br/>Assignments, due Records, domain actions"]
  AUD["Audit / Reports<br/>reconstructs a service date<br/>expected versus actual<br/>from the configuration effective that day"]

  FB --> DBb
  EB --> DBb
  DBb --> RUN
  DBb --> AUD
  FB --> RUN
  EB --> RUN

  classDef canon fill:#e7f6ec,stroke:#1f7a3a,color:#1a2114
  classDef hub fill:#e8f1fb,stroke:#1d4e89,color:#1a2114
  class FB,EB,RUN,AUD canon
  class DBb hub
```

| Owner | Question it answers | Department Builder may |
|---|---|---|
| Facility Builder | What places exist, and which Departments are responsible? | Show them. Link edits of name, tree, and responsibility back here. |
| Employee Builder | Who works here, in which Team and Role? | Show them. Not author Team or Role identity. |
| Department Builder | How does this Department use those places, people, timing, and Records? | Compose them. Author only the Department configuration that has no other owner. Location participation is stored by Operating Rhythm, Records, Coverage, and Menus as canonical place ids. |
| Operating Rhythm | When does this Department run? | Show participation. Not create a second clock. |
| Records | What must be documented? | Configure Department requirements through the one engine. |
| Run | What is happening today? | Not store today’s truth on the builder. |
| Audit / Reports | What was expected, and what happened? | Not snapshot a private copy of every owner. |

Rule from the decision: **display can compose; editing follows ownership.**

## What Facility is in the target

```text
Facility Builder
    Facility
      Building          structural
      Floor             structural
      Neighborhood      actionable unit
      UnitSpace         the room
    UnitDepartmentResponsibility
    UnitSpaceResponsibility

Department Builder → Facility
    reads responsible places for the selected Department
    shows rhythm, people, coverage, records, assets, menus
    persists no second room, no room classification, and no merged copy
```

Forbidden by the decision, and already forbidden by the current foundation:

```text
DietaryLocation
EVSLocation
PlantLocation
DepartmentLocation
a second responsibility table
a new LocationFunction table beside the archetype store
  without an explicit migration
```

## Generic Work leaves the shell

The decision retires the Department Builder Work section and, after a dependency trace, the generic machinery: Work Plans, Expected Work, Work occurrences, Work presets, and Work-only applicability.

It does not retire Records, Operating Rhythm, shifts, Assignments, Coverage, Menus, Assets, or Plant Requests, Issues, Work Orders, and Preventive Maintenance.

**Repo vs November 1.** `DepartmentWorkPlan`, `DepartmentWorkItem`, `DepartmentWorkPlanApplicability`, and `DepartmentWorkOccurrence` are still in the schema. Job Flow and the Work tab still read them. Retirement is a decision, not a deletion.

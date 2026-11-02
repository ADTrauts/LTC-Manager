# Visual 3 — Facility / location ownership map

November 2, 2026: Department meaning is responsibility plus each engine’s own location ids. The Location Function examples below are the November 1 idea, now retired. See [08](./08_LOCATION_FUNCTION_ELIMINATION_AUDIT.md).

The point of this drawing: **there is one physical room.** Food & Nutrition, EVS, and Plant do not each get a copy of it.

The place names and function labels below are the November 1 example. They are not rows from a facility, and they are not the current Food & Nutrition catalog. Today that catalog has one function, `food_service_area` (“Food Service Area”). EVS has `resident_care` and `service_support`. Plant defines none.

## One walk down the physical tree

```text
Facility                          CANON  Facility Builder
  ↓
1st Floor                         CANON  Unit, hierarchyRole FLOOR
  ↓                               structural organizer, not a Department location
1A Naval Park                     CANON  Unit, hierarchyRole NEIGHBORHOOD
  ↓
Servery                           CANON  UnitSpace
                                  one id, one name, one parent
```

```mermaid
flowchart TB
  FAC["Facility"] --> FLR["1st Floor<br/>Unit FLOOR"]
  FLR --> NBH["1A Naval Park<br/>Unit NEIGHBORHOOD"]
  NBH --> ROOM["Servery<br/>UnitSpace<br/>ONE physical room"]

  classDef canon fill:#e7f6ec,stroke:#1f7a3a,color:#1a2114
  class FAC,FLR,NBH,ROOM canon
```

Floors are not assigned as operating locations. Neighborhood responsibility and room responsibility are separate rows. A room does not inherit responsibility from the floor or the neighborhood.

## Physical identity stays in Facility Builder

```text
PHYSICAL IDENTITY
Facility Builder
    owns the Servery UnitSpace
    owns its name, hierarchy, and FacilityRoomType
    Department Builder does not rename it and does not copy it
```

## Department responsibility is also Facility Builder

Responsibility is a relationship on the existing place. It is not a new place.

```text
DEPARTMENT RESPONSIBILITY
Facility Builder
    UnitSpaceResponsibility on Servery

    Food & Nutrition   = responsible     row exists
    EVS                = maybe           only if a second row exists
    Plant              = maybe           only if a second row exists
```

**Repo vs November 1 example.** Neighborhood rows have `kind`: PRIMARY, BACKUP, or SUPPORT. Room rows do not. A room is responsible or not, plus an optional `capabilities` string array. The example word “Primary” matches neighborhood responsibility, not the current room row.

Several Departments can hold a responsibility row on the same `UnitSpace`. That is still one room.

```mermaid
flowchart LR
  ROOM["UnitSpace Servery<br/>one id"]

  ROOM --> FN["UnitSpaceResponsibility<br/>Food and Nutrition"]
  ROOM --> EVS["UnitSpaceResponsibility<br/>EVS — only if assigned"]
  ROOM --> PL["UnitSpaceResponsibility<br/>Plant — only if assigned"]

  classDef canon fill:#e7f6ec,stroke:#1f7a3a,color:#1a2114
  classDef maybe fill:#f4f1ea,stroke:#8a6a2f,color:#1a2114
  class ROOM,FN canon
  class EVS,PL maybe
```

## Department meaning is not another room

Each responsible Department may bind its own Location Function to that same id. The binding is Department-scoped. It does not create a Dietary room, an EVS room, or a Plant room.

```text
DEPARTMENT MEANING
same UnitSpace id

Food & Nutrition
    Location Function = Resident Servery          target example
    current catalog key would be food_service_area

EVS
    Location Function = Service Support           current key service_support
    or Resident Care, if that is the function they bind

Plant
    possibly no Location Function
    the product list is empty, and empty is allowed
```

```mermaid
flowchart TB
  ROOM["UnitSpace Servery<br/>still one row"]

  ROOM --> B1["Food and Nutrition binding<br/>DepartmentRoomArchetype.key<br/>on that Department's profile"]
  ROOM --> B2["EVS binding<br/>a different profile<br/>a different key<br/>same unitSpaceId"]
  ROOM --> B3["Plant<br/>no binding required"]

  B1 --> L1["Meaning: Resident Servery<br/>target example, not a current catalog key"]
  B2 --> L2["Meaning: Service Support"]
  B3 --> L3["No Department function"]

  classDef canon fill:#e7f6ec,stroke:#1f7a3a,color:#1a2114
  classDef persist fill:#e8f1fb,stroke:#1d4e89,color:#1a2114
  classDef none fill:#f4f1ea,stroke:#8a6a2f,color:#1a2114
  class ROOM canon
  class B1,B2 persist
  class B3,L3 none
```

What we do not create:

```text
DietaryLocation
EVSLocation
PlantLocation
a Department room hierarchy
a second UnitSpace per Department
```

## What else may attach to that same room

Each line has its own owner. The Facility page can list them. It does not absorb them.

```mermaid
flowchart TB
  ROOM["Servery UnitSpace"]

  RHY["Operating Rhythm<br/>CANON DepartmentOperationalCycle<br/>participation by explicit room<br/>or by Location Function key<br/>responsibility alone does not enroll the room"]
  PPL["Teams / Roles<br/>CANON target: Employee Builder<br/>today: Team room membership is a direct link"]
  COV["Coverage<br/>derived<br/>configured need + shift + call-off + daily Assignment"]
  REC["Records<br/>CANON LogAttachment<br/>aimed at this space or at the function key"]
  AST["Assets<br/>CANON Asset.spaceId<br/>identity edited in Asset Builder"]
  MNU["Menus<br/>Food and Nutrition<br/>MenuLocationApplicability.spaceId<br/>plus a root cycle stableKey"]
  PM["PM / Work Orders<br/>when the attachment is maintenance<br/>PM plan is on the Asset<br/>Work Order is Plant execution<br/>not generic Work"]

  ROOM --> RHY
  ROOM --> PPL
  ROOM --> COV
  ROOM --> REC
  ROOM --> AST
  ROOM --> MNU
  ROOM --> PM

  classDef room fill:#e7f6ec,stroke:#1f7a3a,color:#1a2114
  classDef own fill:#e8f1fb,stroke:#1d4e89,color:#1a2114
  class ROOM room
  class RHY,PPL,COV,REC,AST,MNU,PM own
```

| Attachment | Canonical owner | Points at the room by |
|---|---|---|
| Name, parent, physical type | Facility Builder | the `UnitSpace` row itself |
| Department responsibility | Facility Builder | `UnitSpaceResponsibility` |
| Location Function | Department configuration on that room | `DepartmentRoomArchetypeBinding.unitSpaceId` |
| Cycle / Phase / Key Point | Operating Rhythm | explicit location, function key, or Key Point room group |
| Team | Today: Department Team. Target: Employee Builder | `DepartmentTeamRoomMembership` today |
| Coverage need | Coverage configuration, derived at Run | assignment-template item using the function key; also team-cycle count |
| Record requirement | Records | `LogAttachment.spaceId` or `operationalTypeKey`; also physical-type default |
| Asset | Asset registry | `Asset.spaceId` or `Asset.unitId` |
| Menu | Menu Builder | `MenuLocationApplicability.spaceId` |
| Preventive maintenance | Facility Plant Operations | the Asset, which may sit in the room |
| Work Order | Facility Plant Operations | the Asset, Issue, or request — not a Department location copy |
| Generic Work Plan | Legacy | applicability may name this space or its archetype key |

A Plant-responsible servery with no Location Function is still the same room. Assets and work orders in it do not require a Plant location tree.

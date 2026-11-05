# Visual 4 — Current vs proposed Location Function model

November 2, 2026: the right-hand concept is retired. [08 — Location Function elimination audit](./08_LOCATION_FUNCTION_ELIMINATION_AUDIT.md) is the decision. The diagram below remains as the November 1 idea and the code that still implements it. Do not build toward it.

Left side is the repository. Right side was the November 1 concept. That concept is not a new table, and it is not the target.

## Current chain

```mermaid
flowchart TB
  subgraph persist ["Persistence — all of this is still in Prisma"]
    PROF["DepartmentOperationalProfile<br/>versioned per Department<br/>DRAFT · CERTIFIED · ACTIVE · RETIRED"]
    AREA["DepartmentOperationalArea<br/>LEGACY grouping"]
    AEXP["DepartmentAreaExperience<br/>LEGACY experienceKey into src/lib/experiences"]
    ARCH["DepartmentRoomArchetype<br/>key + name<br/>this is the stored function"]
    AEX["DepartmentArchetypeExperience<br/>LEGACY which experiences the archetype turns on"]
    BIND["DepartmentRoomArchetypeBinding<br/>profile + archetype + unitSpaceId<br/>one binding per room per profile"]
    RX["DepartmentRoomExperienceException<br/>LEGACY ENABLE / DISABLE / OVERRIDE"]
    ROOM["UnitSpace"]
  end

  PROF --> AREA --> AEXP --> AEX --> ARCH
  PROF --> ARCH --> BIND --> ROOM
  PROF --> RX --> ROOM

  subgraph words ["Words in the same path"]
    UI["Locations panel says Location Function"]
    ACT["Some actions still say Operational Type"]
    CODE["Loaders, cycles, logs, work, and coverage<br/>say operationalTypeKey<br/>and read DepartmentRoomArchetype.key"]
    CAT["Product catalog functionKey<br/>food_service_area · resident_care · service_support"]
  end

  CAT -.-> ARCH
  UI -.-> ARCH
  ACT -.-> ARCH
  CODE -.-> ARCH

  subgraph use ["Who reads which profile"]
    BUILD["Build / working<br/>DRAFT, else ACTIVE, else CERTIFIED"]
    RUN["Run<br/>ACTIVE only"]
    AUD["Audit<br/>profile whose activatedAt–retiredAt<br/>covers the service date<br/>no fallback to today's ACTIVE"]
  end

  PROF --> BUILD
  PROF --> RUN
  PROF --> AUD

  subgraph resolvers ["Facility read"]
    OLD["resolve-room-profile.ts<br/>projection Experience decoration only"]
    LP["location-program.ts<br/>Department Facility read<br/>rhythm, coverage, records, assets, menus"]
  end

  AREA --> OLD
  BIND --> OLD
  BIND --> LP

  classDef legacy fill:#f4f1ea,stroke:#8a6a2f,color:#1a2114
  classDef persist fill:#e8f1fb,stroke:#1d4e89,color:#1a2114
  classDef canon fill:#e7f6ec,stroke:#1f7a3a,color:#1a2114
  classDef dup fill:#fdecec,stroke:#9b2c2c,color:#1a2114
  class AREA,AEXP,AEX,RX,OLD legacy
  class PROF,ARCH,BIND,ROOM persist
  class CAT,BUILD,RUN,AUD,LP canon
  class ACT,CODE dup
```

“Operational Type” is not a separate stored object. It is the user-facing and code-facing name for `DepartmentRoomArchetype`. The Locations header has already moved to “Location Function.” Coverage copy, cycle validation messages, work applicability, and log target enums still say Operational Type.

Plant can select a profile archetype as a policy default inside `resolve-room-profile.ts` without writing a room binding. Direct bindings win. That policy path is part of the Experience-era resolver.

## Proposed conceptual model

This is the product concept. It does not mean “create `LocationFunction` now.”

```mermaid
flowchart TB
  PROD["Department Product<br/>defines the allowed Location Functions<br/>key and label"]
  BIND["Facility binds one allowed function<br/>to an existing responsible UnitSpace"]
  PUB["Published / effective configuration<br/>working draft for Build<br/>published for Run<br/>service-date effective for Audit"]
  USE["Run and Audit consume that binding<br/>they do not invent a function from<br/>room name or FacilityRoomType"]

  PROD --> BIND --> PUB --> USE

  EX["Food and Nutrition — target examples, not current keys<br/>Resident Servery<br/>Production Kitchen<br/>Retail Service Area<br/>each bound to a UnitSpace"]

  PROD -.-> EX
  EX -.-> BIND

  classDef concept fill:#e7f6ec,stroke:#1f7a3a,color:#1a2114
  classDef note fill:#e8f1fb,stroke:#1d4e89,color:#1a2114
  class PROD,BIND,PUB,USE concept
  class EX note
```

```text
Department Product
    ↓
defines allowed Location Functions
    ↓
Facility binds a Location Function
to an existing responsible room
    ↓
Published / effective configuration
    ↓
Run / Audit consumers
```

Example from the decision, drawn as concept:

```text
Food & Nutrition
    ↓
Resident Servery
Production Kitchen
Retail Service Area
    ↓
UnitSpace binding
```

**Repo vs November 1.** The concept wants a Product list of functions. The current list for Food & Nutrition is a single key, `food_service_area`. The three names above are examples in the architecture decision. They are not implemented keys. Adopting a function today copies the catalog key onto the draft archetype; a free-typed label does not mint a new key.

## Product concept vs current persistence

```text
PRODUCT CONCEPT                         CURRENT PERSISTENCE
Location Function                       DepartmentRoomArchetype.key
                                        + DepartmentRoomArchetype.name
                                        on DepartmentOperationalProfile

Bind to a responsible room              DepartmentRoomArchetypeBinding
                                        unique per profile + unitSpace

Working vs published vs historical      profile status and activatedAt / retiredAt
                                        keep this while consumers need it

Not part of the concept                 DepartmentOperationalArea
                                        DepartmentAreaExperience
                                        DepartmentArchetypeExperience
                                        DepartmentRoomExperienceException
                                        Experience catalog
                                        the phrase Operational Type
                                        the phrase archetype, as product language
```

The decision’s rule for the later code pass: trace every profile, archetype, binding, and exception reader before simplifying. Do not add a third implementation beside this one in order to make the diagram look like the concept.

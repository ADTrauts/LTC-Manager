# Location Function elimination audit

**Date:** November 2, 2026  
**Question:** Does the released product need Location Function, Operational Type, or `DepartmentRoomArchetype`?  
**Verdict:** Retire the concept. It is a live grouping query, not a business fact.  
**Phase 2 status (November 2, 2026):** Operating Rhythm no longer targets cycles by Location Function, Operational Type, unit type, or Facility Room Type. A cycle is department-wide through Facility responsibility (`ALL_DEPARTMENT_UNITS`) or an explicit list of canonical Unit and UnitSpace ids (`EXPLICIT_UNITS` / `DepartmentOperationalCycleLocation`). Filters assist selection and are not saved. Key Point room groups stay explicit space ids. Menu cycle checks use the menu's canonical location. The persisted enum values `OPERATIONAL_TYPES`, `UNIT_TYPES`, and `ROOM_TYPE` remain until a later schema pass and do not match.

**Phase 3 status (November 2, 2026):** Records applicability is the canonical target stored on `LogAttachment`: `FACILITY`, `DEPARTMENT`, `UNIT`, `SPACE`, or `ASSET`. `OPERATIONAL_TYPE` attachments do not match. Run, Audit, and Runtime evidence do not expand `operationalTypeKey` through a Department profile or archetype binding. Audit reconstructs a past date from the attachment effective interval and that canonical target. Facility Room Type defaults and room suppressions are not live Records rules. Location filters in the assign dialog are not saved. A Unit target matches that Unit. It is not a room-type query, and Audit does not copy it onto every current child room. Coverage, Teams, Experience projection, generic Work, and the runtime operational-type sidecar outside Records still consume Location Function. The enum value and the default/suppression tables remain until the final schema pass and have no forward Records behavior.

There are no customer installations. Test rows, bookmarks, and the size of the current code are not reasons to keep the concept.

The November 1 decision said Department Builder binds a Location Function onto a responsible room. This audit supersedes that part. Facility Builder still owns the physical tree and Department responsibility. Department Builder → Facility becomes a composed view of the places that Department is already responsible for.

---

## What the mechanism actually does

There is one physical `UnitSpace`. A Department profile holds `DepartmentRoomArchetype` rows. `DepartmentRoomArchetypeBinding` points one archetype at one room. The archetype `key` is what the rest of the system calls `operationalTypeKey` or `functionKey`.

Readers do not ask “what is this room called for this Department?” and then stop. They ask “which rooms currently carry this key?” and treat that set as the target of a cycle, a record requirement, a coverage need, a team, or a Work plan.

That is indirection:

```text
engine stores a key
        ↓
profile binding expands the key to UnitSpace ids
        ↓
a later binding change changes every engine that stored the key
```

Plant already runs with an empty function catalog. Projection already says an Operational Profile must not gate physical visibility. Responsibility already decides which Department may use the room.

The product catalog in `src/lib/department-products/location-functions.ts` has three keys: `food_service_area`, `resident_care`, `service_support`. Dietary cycle starters and Work presets are written against those keys. That is starter content, not a separate business object.

---

## Deliverable 1 — Dependency map

| Consumer | Current use | Why it uses the key today | Real business need for the key? | Can canonical location replace it? | Proposed target |
|---|---|---|---|---|---|
| Operating Rhythm, `locationMode = OPERATIONAL_TYPES` | `DepartmentOperationalCycle.applicableOperationalTypeKeys` expands through bindings in `cycle-applicability.ts` | One key selects every room bound to it, including rooms bound later | No. The business fact is which places participate in the cycle | Yes. `EXPLICIT_UNITS` and `DepartmentOperationalCycleLocation` already store unit and space ids. `ALL_DEPARTMENT_UNITS` already means the Department’s responsible places | Persist space ids, unit ids, or department-wide. Room type, floor, and neighborhood are authoring filters only |
| Operating Rhythm, explicit and department-wide modes | `EXPLICIT_UNITS`, `ALL_DEPARTMENT_UNITS` | They do not need the key | The need is location participation | Already canonical | Keep |
| Legacy cycle modes `UNIT_TYPES`, `ROOM_TYPE` | Columns remain. `cycle-applicability.ts` says they no longer match | Old physical classification targeting | No | Yes, by saving the resolved ids | Delete the modes. Do not revive them as the saved fact |
| Key Point room groups | `DepartmentOperationalCycleKeyTimeGroupRoom` stores space ids | Grouping due times by room | The rooms themselves | Already canonical | Keep the space ids. Dietary starter key points also copy `food_service_area` onto the row; that copy is unused by `effectiveCycleSpaceIds` |
| Records, `LogAttachment.targetKind = OPERATIONAL_TYPE` | Retired in Phase 3. The value remains in the enum and does not match | — | — | Canonical targets are `FACILITY`, `DEPARTMENT`, `UNIT`, `SPACE`, and `ASSET` | Do not restore key expansion |
| Records history | Phase 3. Audit uses the attachment effective interval and its canonical target | — | The historical question is which requirement was due where | Attachment effective dates | Do not restore profile selection for Records |
| `DepartmentFacilityTypeLogDefault` plus suppression | Retired in Phase 3. Location Program does not inherit or suppress by Facility Room Type | — | — | Explicit `SPACE` attachments | Do not restore type inheritance |
| Coverage | `OperationalAssignmentTemplateItem.applicableOperationalTypeKeys`. `match-expectation.ts` matches a room only when its key is in that list. Empty keys fall back to `unitId` only. There is no space id on the item | Room grain is faked by the key | The need is role + cycle + place + count | Yes, after the item can store canonical location ids | Coverage configuration stores Department, role, cycle when needed, location ids, and required count. The current template is still under its own audit; the key does not survive that audit |
| Coverage episodes and Run | Episode grain is already facility + date + department + **space** + responsibility + cycle | The evaluator discovered the space by expanding the key | The episode is about a place | Yes | Keep the space grain. Stop discovering it through a key |
| Teams | `DepartmentTeam.applicableOperationalTypeKeys` plus `DepartmentTeamRoomMembership` | “This team works this kind of room,” expanded live | No. Target ownership says a Team does not own rooms | The team dependency disappears when Teams stop programming locations | Delete both the key list and room membership from Team identity |
| Viewer team scope | `viewer-team-scope.ts` unions explicit team rooms with rooms whose ACTIVE key is on the team | Today’s Work / walk-list scope | No. It is the team indirection again | Yes. Scope follows Assignment and explicit responsibility, not a key | Remove this expansion with the team cleanup. Today’s Work is already on the retirement path |
| Generic Work | Presets and `DepartmentWorkPlanApplicability.kind = OPERATIONAL_TYPE` | Presets refuse to apply until the function key is adopted (`location-functions.hermetic.test.ts`) | No. Generic Work is already retired | Not applicable | Delete with Work. This dependency disappears. It is not a reason to keep the key |
| Runtime Location State | `compose.ts` carries an `operationalType` sidecar beside Location Program. Evidence resolution passes the key into `matchLogAttachmentToLocation`. Cycle presentation passes it into `cycleAppliesToSpace` | So the matchers can expand keys | Nothing remains once matchers use place ids | Yes | Runtime knows the place, the Department, responsibility, rhythm, records, coverage, assets, and product extensions |
| Menus | `menu-runtime.ts` does not store a function. It passes `operationalTypeKey` into cycle matching so “does this cycle occur at this menu location?” respects `OPERATIONAL_TYPES` | Only because cycle matching does | Menu applicability is already `MenuLocationApplicability` on unit xor space, plus a cycle stable key | Yes | Menu keeps its own location rows. Cycle matching stops taking a function key |
| Job Flow | No direct archetype reader. Dietary job flow tests do not reference the keys. Flow still reads generic Work, which can be function-targeted | Inherited from Work | No | Work retirement removes it | Do not add a function to Job Flow |
| Dashboard | Attention and runtime fixtures copy `operationalTypeKey` through operational context | Display / fixture of the sidecar | No | The place and the cycle are enough | Stop copying the key |
| Locations UI | `locations-panel.tsx` adopts catalog keys onto the draft profile and binds them to rooms. Publish activates the profile | This is the editor for the indirection | No separate label is required for release. The room already has a physical name and a Facility Room Type | The page lists responsible places | Remove adopt / bind / publish. Show responsibility, physical type, and links to each engine |
| Product registry | `location-functions.ts` and Food & Nutrition / EVS starters | Gives presets and cycle defaults a key to aim at | No | Starters aim at department-wide or leave locations empty until the facility selects places | Delete the catalog |
| Experience projection | `resolve-room-profile.ts` and `projection/pipeline.ts` resolve areas, experiences, exceptions, and a Plant policy-default archetype. Unmapped rooms warn and are skipped for experiences. Responsibility still supplies the footprint | Legacy Experience tree | No. The comment in the pipeline already says the profile must not gate visibility | Location lists use responsibility | Delete the Experience catalog, areas, exceptions, and the policy-default archetype |
| Effective Location Program | Legacy resolver. Header says it remains until Run stops keying off bindings. It still returns experiences and Work overlays | Old composition | No | Location Program, rewritten around canonical owners | Delete after Run matchers stop reading bindings |
| Historical profile selector | `historical-operational-type.ts`. Run uses ACTIVE only. Audit uses `activatedAt` / `retiredAt` and refuses to fall back to today’s ACTIVE | Required only to expand keys stored by other engines | No business question needs “Room X had function Y on date Z” once those engines store their own effective places | Each owner versions its own applicability. Cycles, log attachments, and coverage templates already have effective dates | Delete the selector with the key |

### Operating Rhythm target

```text
Operational Cycle
    → explicit canonical locations
      space ids and/or unit ids
    or
    → department-wide
      every place this Department is responsible for
```

Authoring may offer:

```text
Select all Department-responsible locations
Select all rooms under this Neighborhood
Select all rooms on this Floor
Select all rooms with Facility Room Type X
Select the rooms in the current filter
```

The save writes ids. The filter is not re-evaluated tomorrow.

`ALL_DEPARTMENT_UNITS` stays, because “everywhere this Department is responsible” is responsibility, not a room classification. A new responsible room joining a department-wide cycle is an explicit product rule of that mode, and the authoring screen should say so. A cycle that listed specific serveries does not gain a new room.

### Records target

Canonical targets that already exist:

```text
FACILITY
DEPARTMENT
UNIT
SPACE
ASSET
```

Removing Location Function means deleting `OPERATIONAL_TYPE` and `LogAttachment.operationalTypeKey`. Requirements derived from a space, unit, department, facility, or asset attachment do not need a profile. `OperationalEvidenceRecord` stores the submission; it does not need the key.

`DepartmentFacilityTypeLogDefault` is a second implicit rule: every room of a physical type inherits a log until a suppression row opts out. Location Program is the consumer. The same bulk action that selects “Facility Room Type = Servery” should create real `SPACE` attachments. Do not keep the type-default table as a quieter Location Function.

### Coverage target

```text
coverage need
    Department
    Role
    Cycle or Phase, when the need is cycle-bound
    canonical Facility location ids
    required count
```

Today the item cannot name a space. Room targeting exists only through the key, with a unit fallback when the key list is empty. Deleting the key without adding location ids would collapse coverage to unit or department grain. That is a consumer migration, not a reason to keep the key. Coverage’s own model is still being audited; this audit only requires that the surviving model not store `applicableOperationalTypeKeys`.

### Teams

`applicableOperationalTypeKeys` exists to answer “which teams normally work this kind of room?” The November 1 workforce decision already says a Team does not own physical location. When Team identity moves to Employee Builder as Department → Team → Role → Employee, both the key list and `DepartmentTeamRoomMembership` leave. Those Location Function dependencies disappear with the team correction. They do not justify keeping the key until Employee Builder is finished; the column can be dropped as soon as viewer scope and Location Program stop reading it.

### Generic Work

Work presets, Work plan applicability of kind `OPERATIONAL_TYPE`, Expected Work room sets from `resolveWorkCycleRoomParticipation`, and Work occurrences that landed on those rooms are dependencies that disappear with generic Work. No test Work configuration is migrated.

### Runtime composition

If Runtime Location State knows the canonical place, the selected Department, responsibility, the published cycles that name that place, the record requirements that name that place, coverage for that place, assets at that place, and product extensions such as menus, the operational-type sidecar adds no fact. It exists so matchers can expand a key. Remove it when those matchers stop.

### History

The profile states `DRAFT`, `CERTIFIED`, `ACTIVE`, and `RETIRED`, plus `activatedAt` and `retiredAt`, answer one question: which key was bound to which room on a service date.

That question matters only because cycles, records, coverage, teams, and Work stored keys. It is not an independent operational record. A released Audit needs:

- which cycle locations were effective that day, from the cycle’s own version and effective dates
- which record requirement was effective, from the attachment lineage
- which staffing need was effective, from the coverage template’s effective dates
- which menu applied, under Menu’s own rules

A generic Department profile is not required to remember those. Test profiles can be destroyed.

---

## Deliverable 2 — The simpler architecture

```text
                        FACILITY BUILDER
                              │
                  Facility → Unit → UnitSpace
                              │
                 Department responsibility
                 Facility Room Type / physical classification
                              │
                              ▼
                    DEPARTMENT BUILDER
                           Facility
                    places this Department is responsible for
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   Operating Rhythm         Records          People / Coverage
   location ids or          place, unit,     role + location ids
   department-wide          department,      + cycle + count
                            facility, asset
                              │
                            Assets
                         at a unit or space
                              │
                      Product extensions
                      Menus on location ids
                      PM on Assets
```

No Location Function. No Operational Type. No archetype. No Department room-classification layer.

### What this cannot represent

One capability is actually missing, and it is the one this audit rejects.

**Live shared membership.** A manager binds Servery A to `food_service_area`. Breakfast, the temperature record, the server coverage need, and the culinary team all start including Servery A without anyone editing those four objects. Rebinding the room removes it from all four.

That is one write with many consequences. It is also implicit. A room can start receiving obligations because its classification changed, including rooms classified by someone thinking only about a label.

Explicit architecture represents the same outcome as a confirmed bulk action: “Add Servery A to the same cycles, record requirements, and coverage needs as the other selected serveries,” which writes Servery A’s id into each owner. The difference is that each owner’s saved set changes only when that action runs.

No other gap showed up.

| Scenario | Why it looked like a gap | How the simpler model says it |
|---|---|---|
| Food & Nutrition runs Breakfast in the Servery, and EVS cleans that same room | Two Departments, one room, two old function keys | Two responsibility rows. Dietary’s Breakfast stores that space id. EVS’s cleaning cycle stores that space id. The Department scopes the engine. The room is not copied |
| Forty resident rooms need a morning clean and a daily record | Selecting forty rooms is tedious | Authoring filter “responsible rooms under 1A whose Facility Room Type is Resident Room” writes forty space ids. The filter is not stored |
| A new resident room is added next month | The old key would have enrolled it everywhere | It stays unconfigured until someone applies the existing set or selects it. That is the intended rule |
| Production kitchen and resident servery share a sloppy physical type | The function key was a second label | Give them distinct Facility Room Types, or select the specific rooms. The physical name is already “Main Kitchen” or “Servery.” A Department does not need a third name to run Breakfast |
| Audit asks what was due on a past Tuesday | The profile replayed the key | The cycle version, the attachment effective interval, and the coverage template effective interval answer their own questions |
| Plant has no function keys | It looked like an exception | It is the general case. Assets, responsibility, and explicit places are enough |

Grouping convenience does not justify a reusable primitive. The enrollment behavior is the only behavior explicit ids do not reproduce automatically, and automatic enrollment is the behavior the product should not have.

---

## Deliverable 3 — Bulk authoring

Authoring filters:

```text
All locations this Department is responsible for
All rooms on Floor 2
All rooms under 1A Naval Park
All rooms with Facility Room Type = Servery
All rooms with Facility Room Type = Resident Room
The rooms currently visible in this filter
```

Resolution at save time:

```text
User action: all Food & Nutrition serveries
Resolved ids: space-A, space-B, space-C, space-D
Operating Rhythm stores those four ids
```

It does not store `functionKey = food_service_area`.

**Scalability.** A neighborhood of resident rooms is tens or low hundreds of ids. `DepartmentOperationalCycleLocation` and `LogAttachment` already store ids. The write is larger than a single key and remains a normal configuration save. Audit and Run read the ids on the version that was effective. They do not re-interpret a classification.

**Maintainability.** The cost moves to the moment a room is added. That cost is visible: the room is responsible and not yet on Breakfast, not yet on a record requirement, not yet on a coverage need. The Facility composition page is the place that shows “not configured.”

**No implicit magic.** A new Servery does not join Breakfast because its Facility Room Type matches. Matching type is how the user finds the rooms. The offer is:

```text
This Servery is not on Breakfast, the temperature requirement, or server coverage.
Apply the same configuration as the other Serveries?
```

Confirming writes the new id into the selected owners. Dismissing leaves the room unconfigured. Department-wide mode is the exception that must be labeled in the cycle editor: “new responsible locations are included.”

`DepartmentFacilityTypeLogDefault` violates this rule today. Retire it rather than treating physical type as a silent query.

---

## Deliverable 4 — Removal classification

Test facilities are reseeded. Rows are not migrated. Applied migration files stay untouched. The drop is a new forward migration. `prisma migrate reset` is not part of this plan.

| Item | Class | Why |
|---|---|---|
| Location Function as a product concept | DELETE | No business fact beyond indirect grouping |
| `src/lib/department-products/location-functions.ts` | DELETE | Catalog exists to feed the key |
| Operational Type terminology | DELETE | Same key, older name |
| `operationalTypeKey` columns and arguments | MIGRATE CONSUMER FIRST | Cycles, attachments, coverage items, work applicability, and team rows still read them |
| `DepartmentRoomArchetype` | DELETE | After consumers stop expanding keys |
| `DepartmentRoomArchetypeBinding` | DELETE | Same |
| `DepartmentOperationalProfile` | DELETE | Its only released job is versioning those bindings. `CERTIFIED` has no separate business meaning |
| `DepartmentOperationalArea` | DELETE | Experience-era grouping |
| `DepartmentAreaExperience` | DELETE | Experience catalog membership |
| `DepartmentArchetypeExperience` | DELETE | Same |
| `DepartmentRoomExperienceException` | DELETE | Same |
| `src/lib/experiences` catalog | DELETE | Not a forward product tree. Projection must stop resolving it first |
| Policy-default archetype | DELETE | Plant projection fallback. Visibility already uses responsibility |
| `historical-operational-type.ts` | DELETE | Records Audit no longer calls it. Coverage review still does. Drop with Coverage |
| Location Function adopt / bind / publish UI | DELETE | The editor of the retired concept |
| `resolve-room-profile.ts` | DELETE | Experience resolution |
| `effective-location-program.ts` | DELETE | Legacy composition over the same bindings |
| `load-operational-type-targets.ts` | DELETE | After cycle, coverage, team, and work loaders stop calling it |
| Cycle mode `OPERATIONAL_TYPES` | DELETE | After cycles store ids or department-wide |
| Cycle modes `UNIT_TYPES` and `ROOM_TYPE` | DELETE | Already non-matching legacy |
| `DepartmentFacilityTypeLogDefault` and `DepartmentLocationLogSuppression` | DELETE | Records no longer reads or writes them. Tables remain until the final schema pass |
| `DepartmentTeam.applicableOperationalTypeKeys` | MIGRATE CONSUMER FIRST | Drop when team scope and Location Program stop reading it. Does not survive the team model |
| `DepartmentTeamRoomMembership` | DELETE | Team does not own rooms. Separate from the key, same cleanup |
| Generic Work applicability of kind `OPERATIONAL_TYPE` | DELETE | Dies with Work. No migration |
| Projection experience pipeline | MIGRATE CONSUMER FIRST | `load-locations.ts`, partner locations, and legacy Today’s Work still call projection. Footprint must stay on responsibility while experience resolution is removed |
| Runtime operational-type sidecar | MIGRATE CONSUMER FIRST | Records evidence no longer reads it. Coverage, Teams, and other runtime callers still do |
| Menu `operationalTypeKey` argument | MIGRATE CONSUMER FIRST | Pass-through into cycle matching only |
| Facility tree, Facility Room Type, responsibility | KEEP FOR AN UNRELATED REASON | They are the physical model |
| Operating Rhythm, Records engine, coverage answer, assets, menus, PM, work orders | KEEP FOR AN UNRELATED REASON | Their applicability changes shape. The engines stay |
| `ALL_DEPARTMENT_UNITS` and explicit cycle locations | KEEP FOR AN UNRELATED REASON | Already the target |
| Log targets other than `OPERATIONAL_TYPE` | KEEP FOR AN UNRELATED REASON | Already canonical |
| Profile draft/publish machinery | NO LONGER USED | After the bindings are gone there is nothing for it to publish |

---

## Deliverable 5 — Removal map after this decision

### Keep

```text
Facility physical tree
Facility physical classification
Department responsibility
Operating Rhythm, with explicit locations or department-wide
Records engine, with explicit targets
Employee, Team, and Role as workforce concepts
Coverage as a derived answer
Assets
Menus
Plant Requests, Issues, Work Orders, and PM
```

Effective dating stays on the owner that has a real history question: cycle versions, record attachment intervals, coverage template intervals, menu rules. It does not stay on a Department room-classification profile.

### Move / consolidate

```text
Teams → Employee Builder
Roles → Employee Builder, under Team
Coverage need → coverage configuration that names locations, not a function key
```

### Retire

```text
Location Function
Operational Type
DepartmentRoomArchetype
DepartmentRoomArchetypeBinding
DepartmentOperationalProfile
Operational Areas
Experience catalog
Area experiences
Archetype experiences
Room experience exceptions
Policy-default archetype
Historical Operational Type resolver
Generic Work, Work Plans, Expected Work, Work occurrences, Work presets
Team-owned room programming, including operational-type keys on teams
Implicit Facility-type log defaults
```

### Dependency proof required

Nothing in this list is “the code is large.” These are the consumers that still expand the key and will mis-resolve if the tables disappear first:

1. Cycle matching (`cycle-applicability.ts`, published cycle loaders, menu runtime’s cycle check, dietary starters that stamp `food_service_area`).
2. Record matching and Audit expansion (`log-operational-type-applicability.ts`, `runtime-location-state/evidence.ts`, `audit-records.ts`, `compose-operational-review-day.ts`).
3. Coverage matching (`match-expectation.ts`) until items store location ids.
4. Team scope (`team-operational-type-applicability.ts`, `viewer-team-scope.ts`) until that expansion is removed.
5. Projection experience resolution (`projection/pipeline.ts` and its location loaders) until experiences are no longer resolved.
6. Generic Work resolvers, which go away with Work rather than being rewritten onto a new grouping key.

---

## Deliverable 6 — Documents that still teach the old concept

Binding documents on `architecture/department-builder-facility-reconciliation` are updated with this decision so November 1 no longer reads as the forward rule.

These older documents still describe Location Function, Operational Type, or archetype as forward architecture. They are not fully rewritten in this pass. The November 2 amendment is the overriding Department Builder rule until their next edit:

- `docs/product/01_PRODUCT_CONSTITUTION.md`
- `docs/product/03_PRODUCT_DOMAIN_MODEL.md`
- `docs/product/08_PRODUCT_LANGUAGE_GUIDE.md`
- `docs/product/15_PLATFORM_PRIMITIVES_AND_ENGINES_REGISTRY.md`
- `docs/product/LEGACY_SURFACE_REGISTER.md`
- `docs/product/14_FACILITY_PLANT_OPERATIONS.md`
- `docs/dashboard/ARCHITECTURE.md`
- `docs/dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md`
- `docs/department-administration/04_ROOM_ARCHETYPE_MODEL.md`
- `docs/department-administration/13_LOCATION_PROGRAMMING_REALIGNMENT.md`
- `docs/department-administration/02_OPERATIONAL_AREA_MODEL.md`
- `docs/department-administration/03_EXPERIENCE_CATALOG_ARCHITECTURE.md`
- `memory-bank/architecture-decisions.md`

---

## Ordered implementation plan

Do not start the schema drop until this sequence is approved. Each phase leaves the app runnable. Test data may be wiped and reseeded between phases. Do not write a migration that copies archetype keys onto new tables.

1. **Guard the concept.** Docs and `AGENTS.md` forbid new readers, writers, starters, and UI for Location Function, Operational Type, archetypes, profiles, and Experiences. This is the current step.
2. **Cycles.** Authoring saves explicit location ids or department-wide. Resolution stops honoring `OPERATIONAL_TYPES`, `UNIT_TYPES`, and `ROOM_TYPE`. Starters stop emitting `food_service_area`. Existing test cycles that only have a function key are reseeded, not expanded into ids by a migration.
3. **Records and Audit.** New attachments cannot use `OPERATIONAL_TYPE`. Run and Audit resolve only facility, department, unit, space, and asset targets. Type-default inheritance stops feeding Location Program. Test attachments that used a key are reseeded.
4. **Coverage.** The surviving need stores canonical location ids. Delete `applicableOperationalTypeKeys` from matching. If the coverage audit replaces the template entirely, the new model simply never has the column.
5. **Runtime and menus.** Remove the operational-type sidecar. Cycle-at-location checks use stored ids only.
6. **Teams and projection.** Stop expanding team scope through bindings. Remove experience resolution from the location footprint. Responsibility remains the list of places.
7. **Work.** Delete function-key applicability with the Work retirement, not as a rewrite onto room types.
8. **Forward migration.** Drop profile, area, area-experience, archetype, archetype-experience, binding, and room-exception tables. Drop `operationalTypeKey` and `applicableOperationalTypeKeys` columns, the `OPERATIONAL_TYPE` enum values, and the type-default tables. Do not edit applied migrations.
9. **Delete the code and reseed.** Remove the catalog, editors, historical selector, and Experience registry. Reseed development facilities from Facility responsibility, explicit cycle locations, and explicit record targets.

## RETIRE LOCATION FUNCTION

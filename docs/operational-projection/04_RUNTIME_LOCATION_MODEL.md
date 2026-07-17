# 04 — Runtime Location Model

## Decision

**Location remains a physical place. An operational location is a derived projection of that place — never a persisted department copy.**

This preserves one Facility Builder hierarchy while allowing the same room to produce different department Experiences.

---

## Three terms

1. **Physical location node** — Facility, Floor, Neighborhood, or Room from Facility Builder.
2. **Operational location projection** — that node viewed through a department (or labeled facility composition), profile, policy, and principal.
3. **Location experience** — the Areas/Experiences/actions enabled at that projected node.

---

## Physical identity

```text
FACILITY  → facilityId
UNIT      → facilityId + unitId     (Floor, Neighborhood, LEGACY)
SPACE     → facilityId + unitId + spaceId   (Room)
```

Existing `unitId` links and `/unit/[unitId]` routes remain valid. Room-aware Experiences initially open the owning Unit Workspace with projected room context. New room routes require a separately certified routing stage.

---

## Eligibility predicates

A physical node may enter Projection only if:

1. facility tenancy matches;
2. Unit is not `STAGED`;
3. Room is placed (`unitId` present) and not undesignated-builder-only;
4. node is active per Facility Builder rules;
5. department scope rule passes (assignment or Plant policy);
6. principal access intersects.

Floor/Neighborhood responsibilities do **not** implicitly flow to rooms. Room assignment is explicit (except Plant policy coverage).

---

## Actionable vs structural

| Presentation | Meaning |
|--------------|---------|
| ACTIONABLE | ≥1 Experience for this lens+principal at this node |
| STRUCTURAL | Ancestor retained for orientation only |

Structural nodes may show aggregate readiness **computed from projected descendants** by the Readiness engine — they do not select a readiness profile by Unit type heuristics as long-term behavior.

---

## Plant facility-wide policy merge

### Problem

Plant must reach nearly every placed room for maintenance without:

- copying Plant `UnitSpaceResponsibility` onto every room;
- inventing fake Facility Builder assignments;
- granting Dietary/EVS Experiences.

### Rule

```text
Plant projection for a room =
  Plant ACTIVE Operational Profile          (what Plant does)
+ Plant facility-wide physical policy       (which rooms are in scope)
+ archetype resolution                      (direct binding OR defaultArchetypeKey)
+ principal intersection
```

From Wave 14B `PLANT_FACILITY_WIDE_POLICY`:

- `createsRoomAssignments: false` — absolute;
- `directBindingsTakePrecedence: true`;
- default archetype e.g. `serviceable_space` for unbound covered rooms;
- `policyEligibleExperienceKeys(profile)` — policy can only expose Experiences already in the Plant profile.

Provenance must record `policyApplied` and covered space IDs for diagnostics — not as durable assignment rows.

### What Plant policy does not do

- Does not create room↔department assignment rows.
- Does not bind archetypes in the database for every room.
- Does not grant non-Plant Experiences.
- Does not bypass RBAC.
- Does not make Floors actionable without Experiences.

---

## One room, three projections (recertified)

Physical: Ground Floor → Kensington → Servery

| Lens | How scope is earned | Example Experiences |
|------|---------------------|---------------------|
| Dietary | Explicit room assignment + Dietary ACTIVE profile + Servery archetype | Meal Service, Temperature Monitoring, … |
| EVS | Explicit assignment + EVS profile + Food Service Area archetype | Room Cleaning, Room Status, … |
| Plant | Facility-wide policy (and/or direct binding) + Plant profile | Assets, PM, Work Orders, … |

Facility Overview shows all three **labeled**, never merged into one control set.

---

## Assignments vs location eligibility

```text
Department projection = places where the department can operate
Employee assignment   = current work placement within that projection
```

An assignment outside the projected department scope is **invalid data** → diagnostic, not broadened visibility.

---

## Vocabulary

Vocabulary renames Floor/Neighborhood/Room labels in presentation. It never changes physical keys, eligibility, or Experience resolution.

---

## Compatibility

Legacy Unit-as-location continues through a named compatibility adapter:

- may remain actionable when legacy Unit responsibilities still apply during migration;
- must not invent room Experiences from Unit type alone once profile path is active for that department;
- staged/undesignated exclusion still applies.

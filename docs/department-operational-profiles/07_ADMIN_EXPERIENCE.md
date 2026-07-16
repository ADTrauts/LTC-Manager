# 07 — Administrative Experience

## Administrative journey

```text
Facility Builder
  define physical hierarchy
  place Rooms
  assign Departments to Rooms
          ↓
Department Administration
  establish Department Operational Profile
  configure Department Room Archetypes
  activate Experiences
  map assigned Rooms to archetypes
  review exceptions
          ↓
Profile Certification
  validate completeness and impact
  activate one profile revision
          ↓
Projection Engine
  resolve Room + Department + Profile + Archetype + Experiences
          ↓
Operational surfaces
  render department-specific work
```

This is a responsibility map, not a UI specification.

## Facility Builder responsibility

Facility Builder answers:

- What Facility is this?
- Where are Floors, Neighborhoods, and Rooms?
- What is each Room's physical identity and type?
- Is the Room active and placed?
- Which Departments operate in this Room?

It does not answer:

- Which modules appear?
- Which logs or checklists run?
- Which readiness signals apply?
- Which equipment workflows are enabled?
- Which department archetype applies?

Department assignment is the handoff boundary.

## Department Administration responsibility

Department Administration answers:

- What operating model does this Department use?
- Which Room Archetypes exist?
- Which Experiences belong to each archetype?
- Which Experiences are department-wide?
- How are Experiences configured?
- Which assigned Rooms use each archetype?
- Which room exceptions are approved?
- Which profile revision is active?

It cannot change physical ancestry or assign ownership to an unassigned Department.

## Recommended administrative sequence

### 1. Department readiness

Show whether the Department has:

- a profile baseline;
- an active profile revision;
- assigned Rooms;
- unmapped Rooms;
- invalid Experience dependencies;
- pending exceptions.

### 2. Profile selection

Start from:

- a curated department baseline;
- an existing facility profile revision;
- a controlled custom profile.

Never start by displaying raw capability checkboxes.

### 3. Archetype design

Review the Department's Room Archetypes and their Experience sets. Make common behavior explicit once.

### 4. Room mapping

List only Rooms assigned to the Department by Facility Builder. Suggest archetypes from physical characteristics, but require intentional confirmation or an approved default rule.

### 5. Exception review

Separate exceptions from standard mappings. Make their scope, reason, and impact visible.

### 6. Impact preview

Before activation, preview:

- Rooms gaining or losing Experiences;
- navigation changes;
- readiness signal changes;
- domain data that becomes in or out of projected scope;
- unresolved legacy capability combinations;
- users or assignments affected.

### 7. Certification and activation

Activate the profile revision only after validation and authorized review.

## Role governance

Conceptually:

- Facility Administrator governs physical structure and may oversee profile activation.
- Department leadership governs operational profile content.
- Product architecture governs the canonical Experience catalog and eligibility.
- Security governance owns role/action permission policy.
- Projection and surface owners consume certified results.

Exact role names and permissions require a later authorization design.

## Cross-system invariants

1. Facility Builder can assign a Department without knowing its Experiences.
2. Department Administration cannot project a Room the Department does not own or cover by certified policy.
3. An inactive or undesignated Room cannot become operational through a profile.
4. Removing a Department assignment creates a profile mapping conflict; it does not silently preserve access.
5. Profile activation never edits physical Room records.
6. Physical moves never rewrite Experience definitions.
7. A new Experience never requires a Facility Builder release.

## Empty and incomplete states

The systems must distinguish:

- Room has no assigned Department — physical governance gap.
- Department assigned, no archetype selected — operational configuration gap.
- Archetype selected, dependency unavailable — Experience availability gap.
- Profile draft exists, no active revision — governance gap.
- User lacks permission — authorization result.

Do not collapse these into “No capabilities.”

## Audit boundaries

Physical audit events:

- Room created, moved, activated, deactivated;
- Department assigned or removed.

Operational audit events:

- Profile created or revised;
- archetype changed;
- Experience enabled, disabled, or configured;
- Room mapped or excepted;
- profile certified or rolled back.

Keeping these audit streams distinct makes ownership and incident analysis clear.

## Facility Overview

Facility administrators may review profile completeness across Departments. This governance view does not create a synthetic all-department Operational Profile and does not merge department Experiences.

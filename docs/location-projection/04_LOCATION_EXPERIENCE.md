# 04 — Location Experience

## What is a Location?

**A Location is a physical place from the canonical hierarchy.**

It is not a department record, a page, a readiness profile, or a collection of modules. In product language, “Location” may refer to a navigable physical node while code continues to use `Unit` and `UnitSpace`.

An operational surface does not consume raw locations. It consumes a projection that answers:

- Is this place relevant to the active department?
- Is it actionable or only structural context?
- Which capabilities are effective here?
- Which experiences and actions are allowed?
- Which domain records may be loaded?

## Should Locations become Department Locations?

The **Locations surface should become department-projected**, but the underlying entity must not become `DepartmentLocation`.

Recommended language:

- persisted model: physical hierarchy;
- application value: department location projection;
- product zone: Locations.

Avoid a `DepartmentLocation` table, copied trees, department-specific room IDs, or department-owned names. Those designs create synchronization and identity failures.

## Actionable and structural locations

The physical hierarchy has two operational presentation roles.

### Actionable

A node has one or more enabled experiences for the active department. It may participate in work lists, readiness, workspace composition, and operational navigation.

Rooms are the preferred actionable level in the completed hierarchy. Legacy Unit locations remain actionable through a compatibility adapter until their room-level adoption is complete.

### Structural

A Floor or Neighborhood is retained because it contains actionable descendants. It provides grouping, ancestry, vocabulary, and aggregate status. It does not automatically receive room capabilities or local controls.

This distinction avoids two bad outcomes:

- hiding physical context by showing a flat room list;
- treating every Floor and Neighborhood as if work is performed directly there.

## Locations surface evolution

The Locations zone should evolve through view-model changes, not route or Facility Builder changes.

### Department lens

Show only:

- actionable locations in the active department projection;
- structural ancestors needed to locate those nodes;
- readiness and counts computed from that same projection.

### Facility lens

Show the physical hierarchy with department-labeled operational summaries. Do not present a union of department controls.

### Empty branches

Prune physical branches with no projected descendants. A user should not browse through empty Floors merely because they exist administratively.

### Legacy compatibility

Existing `/unit/[unitId]` destinations remain stable. During migration, a projected Room may drill into the existing Unit Workspace with room context carried in the projection/view model rather than requiring a route change.

## Location experience contract

Each actionable node exposes a surface-neutral contract:

```ts
type LocationExperience = {
  location: PhysicalLocationRef;
  department: DepartmentRef;
  capabilities: ReadonlySet<string>;
  modules: readonly ExperienceDescriptor[];
  queryScope: LocationQueryScope;
  readinessProfile: string;
  allowedActions: readonly string[];
};
```

No component decides whether Plant should see Meal Service. It receives no Meal Service descriptor and no meal data.

## Workspace behavior

The physical header remains stable:

- physical name;
- ancestry;
- room/space type;
- facility vocabulary;
- shared non-operational metadata.

The body is composed from projected modules:

```text
Physical header
Department context
Department readiness
Projected work queue
Projected domain modules
Department knowledge
```

Changing the department lens changes the operational body, not the room's identity.

## Today's Work behavior

Today's Work consumes projected actionable nodes and department-scoped readiness. It may then rank them by urgency, assignment, operation, and coverage.

The projection answers **where this department can operate**. Today's Work answers **where this supervisor should go now**.

## Operations Center behavior

Operations Center aggregates only signals admitted by the active projection. It keeps its exception-first purpose and does not become a hierarchy browser.

Department mode uses one department projection. Facility mode composes labeled department summaries.

## Business Workspace behavior

Business Workspace consumes projection-scoped inputs before `scopeInputsForContext()`-style section composition. The projection narrows location and data domains; Workspace composition decides which manager-oriented summaries and links to present.

Workspace must not maintain a separate hard-coded department feature matrix once the experience registry exists.

## Non-goals

- No Facility Builder redesign.
- No hierarchy duplication.
- No route redesign.
- No replacement of readiness, assignment, or domain ownership engines.
- No UI specification in this stage.
- No persistence of projection output.

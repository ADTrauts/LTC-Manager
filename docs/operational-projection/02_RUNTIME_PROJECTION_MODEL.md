# 02 — Runtime Projection Model

## Decision

One application-layer **Operational Projection Platform** produces immutable snapshots. All operational surfaces consume purpose-specific adapters over those snapshots. There is one eligibility truth.

This document defines the runtime request, source, and output models as architecture contracts — not TypeScript commitments.

---

## Projection request

```text
OperationalProjectionRequest
  facilityId
  lens
    DEPARTMENT { departmentId, departmentKey }
    | FACILITY   { entitled leadership/admin only }
  principal
    role
    authKind: USER | EMPLOYEE
    allowedUnitIds: Set | ALL
    lockedUnitId?: string
    permissionKeys: Set          # route/action entitlements already resolved
  purpose
    SIDEBAR | LOCATIONS | WORKSPACE | UNIT_WORKSPACE
    | TODAYS_WORK | OPERATIONS_CENTER | BUSINESS_WORKSPACE
    | KNOWLEDGE | ASSIGNMENTS | ASSETS | REPAIRS
    | AI_CONTEXT | DEEP_LINK
  focus?                         # optional physical node for room/unit workspace
  operationContext?              # optional: current OperationInstance / day
  asOf?                          # optional clock for tests; default facility now
```

Rules:

- `purpose` selects **output shape and aggregation**, never a different eligibility truth.
- Client-supplied department IDs, Experience keys, or capabilities are never trusted; server resolves lens from session + entitled departments.
- Unknown/inactive department → empty snapshot + diagnostics — **not** Facility Overview fallback.

---

## Projection source (authoritative inputs)

```text
ProjectionSource
  physicalGraph          Facility Builder hierarchy (placed, active eligible)
  roomAssignments        Room ↔ Department (UnitSpaceResponsibility identity)
  activeProfiles         ACTIVE Operational Profiles by department
  archetypeBindings      Room → Department Room Archetype
  roomExceptions         sparse Experience exceptions
  plantPolicy            PLANT_FACILITY_WIDE_MAINTENANCE (typed)
  vocabulary             presentation labels only
  principalAccess        Unit/PIN locks + RBAC permission set
  revisions              hierarchy, assignment, profile, policy, access-class tokens
```

### Inputs that create a Projection (answered)

| Input | Role |
|-------|------|
| **Facility Builder** | Physical graph; room eligibility; room↔department assignment; staged/undesignated exclusion |
| **Operational Profile** | ACTIVE Areas, Experiences, archetypes, configuration — operational truth |
| **Room** | Physical focus / node; archetype binding target |
| **Department** | Lens; profile selection; ownership labels |
| **Operation** | Optional overlay context for surfaces that need “now”; **not** a structural eligibility input for stable projection |
| **User / Principal** | Access intersection; permission narrowing |
| **Permissions** | Route/action keys that may remove Experiences/actions |
| **Assignments** | Presentation priority / walk ranking only — **not** eligibility |
| **Current operation** | Live overlay for OC / Today / Workspace composition |
| **Time** | Facility timezone for overlays; stable projection does not rebuild on clock tick alone |
| **Vocabulary** | Labels only |
| **Plant policy** | Facility-wide Plant physical scope without fake assignments |
| **AI state** | Never an input to Projection build; AI is a consumer |

---

## Projection output

```text
OperationalProjectionSnapshot
  context
    facilityId, lens, principalClass, purpose, builtAt, revisionTokens
  locations
    roots[]                  # structural + actionable tree
    actionableLeaves[]
    byPhysicalKey            # index
  areas                      # department lens: ordered non-empty Operational Areas
    areaKey, label, order
    experiences[]
      experienceKey, label, tools[], actions[], config
      locationBindings[]     # which physical nodes carry this Experience
      queryScopeHandle
      readinessSignalKeys[]
      navigationContributions[]
      workspaceHandles[]
  departmentWideExperiences[]  # Menus, Recipes, dept Knowledge, etc.
  queryScopes
    byExperience / byDomain  # unitIds, spaceIds, departmentId, constraints
  navigation
    sidebarTree / locationTree descriptors
  plant
    policyApplied: boolean
    policyCoveredSpaceIds    # provenance only
  diagnostics
    missingArchetypes, inactive profile, unknown keys, orphan assignments, …
  provenance
    profileVersionId, policyVersion, hierarchyRevision, …
```

Facility lens returns a **composition** of labeled department snapshots — never a merged Experience soup.

---

## What is projected?

| Projected | Meaning |
|-----------|---------|
| **Areas** | Non-empty Operational Areas for the lens |
| **Experiences** | Resolved, permission-narrowed, archetype-bound |
| **Tools** | In-Experience tools (logs, forms, knowledge attachments) as descriptors |
| **Navigation** | Destinations and structural ancestry |
| **Workspace composition** | Handles for which Experience panels may mount |
| **Room actions** | Allowed action keys per Experience at a node |
| **Knowledge scope** | Which articles/associations are in scope — not article bodies |
| **Assignment scope** | Which locations/departments assignment UIs may query |
| **Asset / Repair / Log / Task / Issue scopes** | Query constraints — not live records |
| **Query scopes** | The contract loaders must enforce |

### What is not projected (live overlays)

Readiness values, open issues, asset condition, inspection results, AI brief text, Work Engine task rows, OperationInstance phase, assignment fulfillment — all remain engine-owned and overlay onto projected scopes.

---

## Identity

```text
Physical identity     = Facility Builder IDs (facility / unit / space)
Projection key        = ephemeral, deterministic, never persisted as FK:
  facilityId
  + lensKey
  + physicalFocus?
  + profileRevision
  + hierarchyRevision
  + assignmentRevision
  + policyRevision
  + principalAccessClass
  + purposeFamily        # coarse family, not every surface variant
```

Purpose family groups adapters that share eligibility (e.g. SIDEBAR and LOCATIONS share location eligibility; WORKSPACE may add focus).

---

## Relationship to `resolveDepartmentRoomProfile`

Wave 14B’s `resolveDepartmentRoomProfile` is the **profile-side half** of room Experience resolution (Areas + Experiences for one room inside one profile). Projection:

1. loads ACTIVE profiles and physical eligibility;
2. applies Plant policy and principal intersection;
3. calls (or inlines equivalent of) room-profile resolution per eligible room;
4. assembles trees, navigation, workspace handles, and query scopes.

Projection must not re-author archetype logic. It consumes the certified resolver semantics.

---

## Purpose adapters

| Purpose | Adapter job |
|---------|-------------|
| SIDEBAR / LOCATIONS | Tree + readiness attachment points |
| UNIT_WORKSPACE / WORKSPACE | Focused Experiences + action keys |
| TODAYS_WORK | Actionable leaves + ranking hooks |
| OPERATIONS_CENTER | Aggregate scopes + exception packing hooks |
| BUSINESS_WORKSPACE | Manager signal scopes + quick-action destinations |
| KNOWLEDGE / ASSETS / REPAIRS / ASSIGNMENTS | Domain scopes for module pages |
| AI_CONTEXT | Compact, labeled context package — no extra eligibility |
| DEEP_LINK | Include/exclude boolean for a target node+Experience |

Adapters may reshape; they may not broaden.

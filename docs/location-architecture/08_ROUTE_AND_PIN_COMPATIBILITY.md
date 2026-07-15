# 08 — Route and PIN Compatibility

## Current route structure

```
/unit/[unitId]                Unit Workspace (primary work surface)
/unit/[unitId]?unitTab=...    Tab navigation within Unit Workspace
/staffing                     Staffing grid (references unitId)
/staffing/assignments         Assignment Board (references unitId)
/today/walk                   Walk list (links to /unit/[unitId])
/today/coverage               Coverage (links to staffing by unit)
/issues/[repairId]            Issue detail (references unitId)
/assets                       Asset list (grouped by unit)
/logs                         Log list (references unitId)
```

---

## Route recommendation

### Keep `/unit/[unitId]` as the canonical section workspace route

**Do not rename to `/locations/[locationId]`.**

Rationale:
- Every existing link, bookmark, AI snapshot path, and readiness chip points to `/unit/[unitId]`
- PIN home routes use `/unit/[activeUnitId]`
- Today's Work walk list generates unit links
- Operations Center unit cards link here
- Changing the route is a full regression surface with zero user-facing benefit
- The product language guide already handles the naming: UI says "Location", code says `Unit`

### Add `/unit/[unitId]/space/[spaceId]` for room-level workspace (future)

When room-level workspaces are implemented (Stage 3+):

```
/unit/[unitId]/space/[spaceId]    Room/space workspace
```

This preserves the unit context while adding room granularity. The unit workspace remains the navigation anchor.

### No redirects needed in Stage 1 or Stage 2

Since Unit routes do not change, no redirect infrastructure is required.

---

## PIN / Tablet model

### Current behavior

```
activeUnitId    stored in session cookie
                set during PIN login or "Lock to this unit" action
                used as PIN home destination
                used for employee unit access validation
```

### Recommended behavior (no change in Stage 1)

`activeUnitId` continues to function as-is:

| Current | Continues to work | Future enhancement |
|---------|-------------------|--------------------|
| Tablet locked to a section | Yes | No change needed |
| Tablet locked to a servery (SERVERY unit) | Yes | May become a UnitSpace later, but unit-level lock still works |
| Employee unit access list | Yes | Controls section access |
| PIN home navigation | Yes | Routes to `/unit/[activeUnitId]` |

### Future PIN enhancement (Stage 3+)

When room-level workspaces exist, tablets may optionally lock to a specific space:

```
activeUnitId     section-level lock (existing)
activeSpaceId    room-level lock (future, nullable)
```

If `activeSpaceId` is set, PIN home routes to `/unit/[activeUnitId]/space/[activeSpaceId]`.
If only `activeUnitId` is set, behavior is unchanged.

This is purely additive and does not affect existing PIN flows.

---

## Impact on existing surfaces

### Left sidebar / Location rail
- Continues to list Units
- Readiness chips remain per-unit
- When spaces are added (Stage 2+), units may expand to show child spaces
- No route change for sidebar links

### Today's Work
- Walk list continues to link to `/unit/[unitId]`
- Coverage continues to reference units
- No change until room-level coverage is implemented

### Operations Center
- Unit cards continue to reference units
- Meal boards reference SERVERY units
- No change

### Business Workspace
- Readiness remains per-unit
- Department health aggregates by unit
- No change

### Issues / Inspections / Assets
- Continue to reference unitId in URLs and queries
- When space-level linking is added, detail pages show room context
- List views continue to group by unit

### AI source paths
- AI operational snapshots reference unitId
- Existing cached snapshots remain valid
- No change to snapshot generation

---

## Migration stages for routes

| Stage | Route changes | PIN changes |
|-------|--------------|-------------|
| Stage 1 | None | None |
| Stage 2 | None (admin-only space management within units) | None |
| Stage 3 | Add `/unit/[unitId]/space/[spaceId]` for room workspace | Optional `activeSpaceId` |
| Stage 4 | None | None |
| Stage 5 (optional) | Consider `/location/[id]` alias with redirect from `/unit/[id]` | None |

Stage 5 is explicitly optional and should only be pursued if there is a compelling product reason to rename the route. The current `/unit/[unitId]` path is functional and stable.

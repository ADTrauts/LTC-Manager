# 15 — Implementation Program

## Status

Wave **15A** (this package): architecture only.  
Implementation begins at **15B** under separate authorization.

---

## Consumer contracts (how each surface consumes Projection)

| Surface | Consumption rule |
|---------|------------------|
| **Sidebar** | Adapter over projected tree; readiness overlay; no local department filters |
| **Locations** | Same eligibility tree; entry to Unit Workspace |
| **Unit Workspace** | Focus node include-check; Area→Experience panels; scoped loaders |
| **Business Workspace** | Replace `scopeInputsForContext` heuristics with Projection scopes before builders |
| **Today's Work** | Rank projected actionable leaves; assignments overlay only |
| **Operations Center** | Aggregate within projected scopes; labeled facility composition |
| **Knowledge** | Scope articles/associations via Knowledge tool/Experience projection |
| **Assignments** | Query/filter within projected department locations; diagnose out-of-scope rows |
| **Assets** | Plant/department Assets Experiences drive list scope |
| **Repairs / Issues** | Department + location scope from Projection; deep link re-check |
| **Future departments** | Same platform — ACTIVE profile + assignments/policy — zero Facility Builder module work |

---

## Migration: what dies, survives, wraps

### Dies (after cutover)

- Per-surface department visibility switches for Experiences.
- Broad facility domain fetches used only to hide cards later.
- Capability-string eligibility as long-term truth.
- Unit-type readiness/module heuristics as eligibility source.
- Independent Sidebar Unit list as operational model.
- Stage 3B capability-based LocationProjectionEngine contract as implementation target.

### Survives

- Facility Builder hierarchy and vocabulary.
- Unit IDs and `/unit/[unitId]` routes.
- RBAC, PIN locks, tenancy.
- Readiness, Operations, Work engines.
- Domain ownership of records.
- Wave 14A registries; Wave 14B profile services + `resolveDepartmentRoomProfile`; Wave 14C admin UX.
- Plant policy boundary module (wire into Projection).
- Business Workspace composition pipeline shape (swap scoping input).

### Wrappers

- **Compatibility adapter** for legacy Unit responsibilities during transition.
- **Shadow comparator** legacy vs Projection scopes.
- **Purpose adapters** (SidebarDTO, WorkspaceDTO, …) over one snapshot.
- **Feature flags** per consumer cutover.

---

## Migration order

```text
15B  Domain model + contracts + flags + golden fixtures
15C  Projection services (source adapter, pipeline, Plant wire, diagnostics)
15D  Shadow mode harness + parity reports
15E  Sidebar + Locations cutover
15F  Unit Workspace scoped loaders + Experience panels
15G  Readiness aggregation inputs from Projection + Today's Work
15H  Operations Center
15I  Business Workspace
15J  Module pages (Assets, Repairs, Knowledge, Assignments)
15K  AI_CONTEXT wiring for Brief / Shift / Recovery
15L  Compatibility cleanup + capability-read retirement gate
```

Each consumer flag independently. No big-bang.

---

## Wave briefs

### 15B — Projection Domain Model

- Types/contracts for request, source, snapshot, query scopes, diagnostics.
- Revision token strategy.
- Feature flags.
- Golden fixtures from Dietary/EVS/Plant profiles.
- **No production surface wiring.**

### 15C — Projection Services

- Repository adapter for ProjectionSource.
- Pure pipeline implementing `03`.
- Integrate `resolveDepartmentRoomProfile` + Plant policy.
- Request memoization.
- Unit/integration tests (determinism, Plant-without-assignments, pruning, permissions).
- **No Sidebar/Locations change yet.**

### 15D — Shadow Mode

- Dual compute scopes; metrics/diagnostics only.
- Parity gates for 15E+.

### 15E — Sidebar + Locations

- Replace flat Unit list with projected tree adapter.
- Preserve PIN/lock/routes.

### 15F — Unit Workspace

- Projection-first load; Experience panel registry; scoped domain fetches.

### 15G — Readiness + Today's Work

- Readiness consumes projected nodes/signals.
- Today ranks projected leaves.

### 15H — Operations Center

- Constrain dashboard queries by Projection.

### 15I — Business Workspace

- Projection scopes into existing composition seam.

### 15J — Modules

- Assets/Repairs/Knowledge/Assignments scoped.

### 15K — AI

- AI_CONTEXT purpose; forbid independent room graphs.

### 15L — Cleanup

- Remove dead filters; retire legacy capability eligibility paths when parity certified.

---

## Explicit non-work in 15B–15C

- No schema for persisted Projection.
- No route redesign.
- No Department Administration rewrite.
- No engine redesign.

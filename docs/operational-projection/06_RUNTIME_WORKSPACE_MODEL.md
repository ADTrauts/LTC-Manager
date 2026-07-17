# 06 — Runtime Workspace Model

## Decision

Operational homes **compose** projected Experiences. They do not decide which Experiences exist. Each home keeps its product question from the Navigation Model.

---

## Homes and Projection purpose

| Home | Product question | Projection use |
|------|------------------|----------------|
| **Business Workspace** | What should I personally do next? | Manager signal scopes, quick-action destinations, optional cached AI peek scopes |
| **Operations Center** | What is wrong across the site right now? | Department/facility aggregate query scopes + exception packing hooks |
| **Today's Work** | Where do I walk / cover / hand off? | Actionable leaves + ranking hooks; assignments overlay |
| **Unit Workspace** | What do I do standing here? | Focused physical node → Area → Experience panels + actions |
| **Locations** | Where can I enter work? | Projected tree (entry points) |
| **Supporting modules** | Domain record management | Domain query scopes only |

Projection never collapses Workspace and OC into one purpose.

---

## Unit Workspace composition

```text
1. Authorize facility + principal
2. Build Projection (UNIT_WORKSPACE, focus = unit/room)
3. Verify focus node is included (else deny/not-found)
4. Load live data ONLY via projected query scopes
5. Mount Experience panels in Area order from snapshot
6. Overlay readiness / operation / open work from engines
```

Illegal after migration:

- fetch all domains then hide cards by department string;
- Unit-type heuristics selecting meal vs EVS vs Plant modules as primary eligibility;
- inventing Experiences not in the snapshot.

---

## Business Workspace

Strongest existing composition seam today (`scopeInputsForContext`). Migration replaces readiness-key / metadata scoping with Projection scopes **before** section builders run. Preferences may rearrange chrome; they may not broaden eligibility. Morning Brief remains cache-peek only.

---

## Operations Center

OC aggregates **projected** domain signals for the active lens. Active department must constrain the query plan first — not only the readiness profile after a full-facility fetch.

Facility lens: labeled multi-department exception packs.

---

## Today's Work

Walk list ranks projected actionable locations using:

- readiness (engine);
- current operation (engine);
- assignments / coverage (engine);
- projected eligibility (Projection).

Assignments never add off-projection Units/rooms to the walk as if they were department-eligible.

---

## Workspace handles

Experiences declare workspace handles (panel IDs, deep-link targets). Projection emits which handles are live for the focus. Surfaces map handles to components via a registry — not ad-hoc department switches.

---

## What remains live inside workspace

| Live | Owner |
|------|-------|
| Readiness chip/state | Readiness |
| Open issues / repairs | Issue/Repair domain |
| Log completion | Log domain |
| Inspection status | Inspection domain |
| Asset condition / PM due | Assets |
| Staffing gaps | People / staffing |
| Operation header | Operations Engine |
| Task dual-write rows | Work Engine |
| AI brief text | Intelligence (cache) |

Projection supplies **where these may be asked**; engines supply **answers**.

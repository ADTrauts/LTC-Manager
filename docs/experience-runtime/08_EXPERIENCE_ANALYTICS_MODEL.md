# 08 — Experience Analytics Model

## Decision

**Primary metric ownership is the Experience.**  
Operational Areas, Departments, and Facilities **roll up** Experience metrics — they do not redefine them.

---

## Ownership layers

```text
Experience          defines metric keys + grain + meaning
    ↓ rollup
Operational Area    sums/groups Experiences in the area
    ↓ rollup
Department          sums/groups areas for the lens
    ↓ rollup
Facility            labeled multi-department composition
    ↓ rollup
Organization        multi-facility (future; never blends loops carelessly)
```

Example:

```text
Temperature Monitoring
  metric: temp_log_completion_rate
Food Safety (Area)
  rollup: food_safety_compliance_index (composed of Experience metrics)
Dietary (Department)
  rollup: dietary_ops_health
Facility
  labeled Dietary / EVS / Plant cards — not one mashed KPI
```

---

## What analytics must not do

- Invent department KPIs that ignore Experience definitions.
- Live inside Experience shells as a warehouse (Reports section is scoped/bounded).
- Become the product home (Review zone may host historical review; Awareness still beats analytics per Product Constitution).

---

## Contract

```text
analytics:
  metricKeys[]
  grain: ROOM | UNIT | DEPARTMENT | DAY | OPERATION
  rollupHints[]
```

Engines/events emit facts; analytics consumers aggregate by Experience keys. Projection scopes which rooms/departments are included for a principal.

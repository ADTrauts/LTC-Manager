# 10 — Product Roadmap

**Status:** Post–Wave 12 roadmap rewrite; Wave 13 Industry Configuration **retired** 2026-09-25  
**Application:** `ltc-manager/`  

> **Clarification:** Implementation treated **Wave 12 as Business Workspace**. The earlier modernization roadmap reserved Wave 12 for **Industry Configuration**. That program is **retired** — industry packs are not how the platform expands. See [../platform-vision/RETIRED.md](../platform-vision/RETIRED.md).

---

## Completed (Waves 1–12 as shipped)

| Wave | Theme (as shipped / intended) | Outcome |
|------|-------------------------------|---------|
| 1 | Shell & navigation zones | Zone IA, RBAC homes, department lens |
| 2 | Operations Center | Exception-first site glance on `/dashboard` |
| 3 | Unit Workspace | Location execution + PIN/kiosk |
| 4 | Today's Work | Walk / coverage / handoffs / call-downs |
| 5 | Operations Engine | OperationDefinition / Instance (flagged) |
| 6 | Readiness | Department-aware Ready / In Progress / Needs Attention |
| 7 | Work Engine | Task dual-write adapters (flagged) |
| 8 | Issues & Recovery | Issue façade, types, recovery UX |
| 9 | Knowledge | Articles + contextual panels |
| 10 | Operational AI | Morning Brief, Shift Transition, Recovery Assistant |
| 11 | Organization / Multi-facility | Org parent + `UserFacilityAccess` + switching |
| **12** | **Business Workspace** | Manager home: Focus, Agenda, Quick Actions, prefs, cached brief peek |

Legacy planning docs that mark Wave 7–12 “not started” are **stale** relative to this table.

---

## Planned

### Current program — Location Program platform (2026-09-25)

**Purpose:** One spine. Stop teaching retired models. Install Harbor items onto places.

**Waves (in order):**

- **A — Stop teaching** (this change): retire Operation entity / Experience catalog / industry packs in docs and IA. No leftover Department Builder tabs. No new Experience-catalog baselines.  
- **B — Install:** facility library of published Harbor logs/checklists, then place on a room or Facility type.  
- **C — Hubs:** Admin is org / billing / access / account. Build is the only builder door.  
- **D — Location workspace from Runtime Location State.**  
- **E — Unwire, then delete** Experience keys, Operation engine, leftover catalogs. **Done** (2026-09-25): RLS cycles/evidence key off Location Program; Projection scope is responsibility; Operation engine + Experience shell deleted; IND-* will-not-do.
- **F — Leftover readers.** Supervisor, employee, offline, log-book, and coverage loaders no longer read Operational Type. Today's Work and Projection do not require the Experience catalog.
- **G — Leftover doors.** Department Builder lives at `/build/departments`. Leftover `/logs` assign redirects to BUILD Logs. New OPERATIONAL_TYPE placements are refused. Operation* tables stay until an explicit drop.
- **H — Inspections.** Harbor catalog purpose `INSPECTION`. Install then place. `/admin/inspections` redirects to `/build/logs`.
- **I — Procedures.** Harbor catalog purpose `PROCEDURE`. Local notes at `/build/knowledge`.

Neutral copy can happen without industry packs. `applyIndustryPack()` is will-not-do.

---

### Later — Multi-Facility Depth

**Purpose:** Grow Organization safely beyond access grants.

**Candidates:**

- Cross-facility templates (knowledge / inspections) with explicit copy semantics  
- Safer facility reassignment / invitation flows  
- Org admin UX polish  
- Still **no** blended Workspace analytics across facilities  

---

### Wave 15 — Supply & Operational Continuity Signals

**Purpose:** Shortages and materials as **readiness/ops signals**, not warehouse accounting.

**Candidates:**

- Supply short issue type / quick capture (slice already described historically)  
- PAR-adjacent signals that feed Focus/Readiness  
- Integrations later  

---

### Wave 16 — Communications / Alerts (Operational)

**Purpose:** Time-sensitive operational alerts — not a chat product.

**Candidates:**

- Call-down / Needs Attention push or digest  
- Preference for alert channels by role  
- Never replace Today's Work handoffs  

---

### Wave 17 — Enterprise Foundations

**Purpose:** SSO, API surface, review/export maturity — for multi-site buyers.

**Candidates:**

- SSO / IdP  
- Stable external API for approved partners  
- Review-zone analytics **without** making it Manager home  

---

## Long-term vision

- Dining and multi-department ops across healthcare/education/corporate settings  
- Engines stay thin; homes stay few  
- AI remains moment-based and grounded  
- LTC remains beachhead branding; a rename does not wait on industry packs  

---

## Dependency sketch

```text
Location Program platform (A → E)
   └── Later: Multi-facility / supply signals / alerts / enterprise
```

---

## Near-term recommendation

**Finish the Location Program program (A then B).** Do not start Industry Configuration. Industry packs are retired.

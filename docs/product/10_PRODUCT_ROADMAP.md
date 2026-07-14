# 10 — Product Roadmap

**Status:** Post–Wave 12 roadmap rewrite  
**Application:** `ltc-manager/`  

> **Clarification:** Implementation treated **Wave 12 as Business Workspace**. The earlier modernization roadmap reserved Wave 12 for **Industry Configuration**. This rewrite makes that explicit and places Industry next.

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

### Wave 13 — Industry Configuration & Language Cleanup

**Purpose:** Finish the platform language layer that the old roadmap called “Wave 12.”

**Candidates (capability — not build list):**

- Neutral terminology and industry packs where dietary-first copy still leaks  
- Data-driven department / mode configuration consolidation  
- Align product-reference homes with Workspace as Manager default  
- Reduce Issue/Repair dual language in UI where safe  

**Not in Wave 13:** Scheduling product, inventory ERP, messaging platform, OC redesign.

---

### Wave 14 — Multi-Facility Depth

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
- LTC remains beachhead branding until industry packs prove a rename  

---

## Dependency sketch

```text
Wave 13 Language/Industry
   └── Wave 14 Multi-facility depth
         ├── Wave 15 Supply signals
         ├── Wave 16 Operational alerts
         └── Wave 17 Enterprise foundations
```

---

## Near-term recommendation

**Start Wave 13 with Industry Configuration & Language Cleanup** — it unlocks clear naming for everything built in Waves 1–12 and reduces conceptual overlap without expanding product surface area.

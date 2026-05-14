# Future projects — LTC market context and product strategy

**Purpose:** Preserve strategic context from operational reality and product discussions so future work does not assume “typical” LTC when the reference site is structurally unusual.

**Last updated:** 2026-05-04

### Shipped note — multi-node + floor hardware (2026-05)

The product now supports **per-browser facility binding** for PIN tablets plus an optional **unit lock** (`ltc_device_unit`): PIN sign-in can land on a fixed unit, **non-assigned** restricted staff still get in with a **warning + audit row** (`KioskUnitPinLoginEvent`), and the **Locations** rail **greys out** other units on that device. See **`architecture-decisions.md`** (PIN / device binding, session shape), **`runbook.md`** (tablet flow), and **`progress-log.md`** (“Unit-locked tablet (kiosk PIN) + sidebar”).

---

## How many LTC food operations are structured

**Typical LTC (often ~100–200 beds):**

- One main kitchen; centralized production.
- One or two dining rooms; tray line to rooms as needed.
- Small nourishment pantries on units are common; **full serveries per unit are not** the default model.
- Roles: cooks, dietary aides/servers, dietary manager/director; dietitian sometimes.
- **Pattern:** centralized production, minimal duplication of production/service nodes.

**Larger or more complex sites** (hospital-affiliated, very high bed counts, campus-style, older builds with legacy floor kitchens, strong union role separation) tend toward:

- More **decentralized** service points (multiple serveries or unit-based finishing/holding).
- Logistics layers (e.g. porters, timed deliveries).
- **Heavier compliance surface:** temperature logs, sanitation, FIFO, audits — often **per service node**, not only at the main kitchen.

**Takeaway:** A facility with a central kitchen **plus many serveries** (e.g. on the order of **17**), porters, unit-level logs/temps/FIFO, and a rigid chain of command is **not** the median LTC dining model. It sits toward **hospital-style**, **large campus**, or **legacy multi-node** operations. That is **higher labor**, **more inconsistency risk**, and **more supervision/compliance burden** than a simple “one kitchen, one or two dining rooms” site.

**Product implication:** If software works at that complexity, it should **down-level** cleanly to simpler facilities. The reverse is not guaranteed.

---

## Contract dining vs self-operated

- **Contract operators** (food service management companies at a facility) are a strong early **ICP** (ideal customer profile): they repeat similar processes across accounts and feel pain in logs, coverage, and multi-unit execution.
- **Self-operated** facilities are a **broader** market but not invalid; they may care less about “dining vendor” positioning and more about in-house tools or generic platforms.
- **Do not** abandon the dining-first story to chase “all of LTC” prematurely; use **sequencing** instead (below).

---

## Product strategy — sequencing (not a forever-only choice)

### Phase 1 — Win dining (current focus)

Ship the best possible support for:

- **Unit-based / multi-servery** execution (differentiator vs tools built for one dining room).
- **Compliance logs** (temps, sanitation, FIFO, audit readiness).
- **Staffing and coverage** tied to real daily rhythm.
- **Execution dashboards** for supervisors and above.

**Positioning (examples):**

- “A daily operations platform for long-term care — **starting with dining**.”
- “Built for **complex** LTC dining: multi-unit service, compliance, and coverage.”

### Phase 2 — Adjacent ops (same patterns, new modules)

After dining is credible, extend patterns that already exist in the product (e.g. modular “logs / units / tasks” shapes) into:

- Maintenance / equipment issues (often already adjacent to kitchen and facility rounds).
- Housekeeping audits (similar cadence to sanitation/temp checks).
- Broader **unit-level** visibility where it does not duplicate EMR/payroll.

### Phase 3 — Facility operating layer (only after proof)

Avoid selling “replace the EMR” or “full HRIS” early. A credible later story is **daily operational rhythm** across the building, anchored in modules that frontline staff touch **every day** (dining is the natural wedge).

---

## Architectural principle

Build **modules** from the start (dining, logs, staffing, room for maintenance/housekeeping) so expansion is **configuration + new module surfaces**, not a rewrite. Dining remains the **entry wedge** (daily use, compliance pressure, cross-building visibility).

---

## Explicit non-goals (early)

- Marketing as “everything for LTC” before dining is demonstrably strong.
- Deep features in domains we do not run day-to-day (e.g. competing head-on with EMR, payroll, clinical documentation).
- Scope creep that trades clarity of ICP for hypothetical TAM.

---

## Risks to remember

- **Building too much too early** is a larger failure mode than shipping a narrow, excellent dining slice.
- **Decentralized physical models** multiply failure modes (timing, temps, stock, staffing per node); the product should reflect that operational truth, not assume one kitchen and one line.

---

## Related memory-bank files

- `project-overview.md` — product scope and MVP boundaries.
- `implementation-phases.md` — sequenced delivery and quality gates.
- `architecture-decisions.md` — session JWT, device cookies, PIN/kiosk behavior.
- `runbook.md` — provisioning, tablet binding, troubleshooting.
- `progress-log.md` — dated delivery notes (search **Unit-locked tablet**).

When dining MVP scope or ICP shifts, update this file and, if needed, `project-overview.md` in the same session.

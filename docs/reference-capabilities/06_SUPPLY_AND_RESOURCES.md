# Capability: Supply and Resources

**Capability ID:** CAP-06  
**Parent:** [00_REFERENCE_CAPABILITIES_INDEX.md](./00_REFERENCE_CAPABILITIES_INDEX.md)

---

## Purpose

Ensure operations have **required physical resources** at the point of use — consumables, disposables, chemicals, ingredients, smallwares — when they are needed.

This capability addresses **operational sufficiency**, not full enterprise inventory management.

---

## Operational promise

The organization knows **what is needed for today's operations**, **whether it is present**, **when shortage threatens service**, and **what recovery to trigger** — without warehouse complexity on the floor.

---

## Inputs

- **Supply catalog** — items used in operations (site or org defined).
- **PAR levels** — minimum expected at location or store for operation type.
- **Depletion signals** — floor reports, counts, usage during execution.
- **Deliveries** — expected arrival, receipt, short shipment.
- **Operation demand** — today's menu, headcount, event scale drives need.
- **Issues** — shortage reports from Issue and Recovery.

---

## Outputs

- **Sufficiency state** — adequate, low, critical short for location × operation.
- **Shortage records** — item, location, severity, operational impact.
- **Recovery triggers** — substitute, borrow, reduce scope, emergency order.
- **Critical resource flags** — items whose absence blocks service.
- **Usage context** — consumption tied to operation where captured.

---

## Core concepts

### Consumables

Items **used up** in operations — trays, domes, chemicals, napkins, disposables, chemicals.

### PARs

**Minimum operational levels** — not accounting valuation; "enough to run lunch."

### Supply shortages

Gap between need and availability **for this operation window**.

### Critical resources

Items whose absence **blocks readiness** — sanitizer, tray covers, key ingredient.

### Operational impact

Shortage expressed as **readiness/at risk** — not only inventory variance.

---

## Boundaries

| In scope | Out of scope (core capability) |
|----------|-------------------------------|
| Operational PAR at point of use | Full ERP inventory |
| Shortage detection and recovery | Purchasing automation |
| Critical item flags for operations | Supplier contract management |
| Floor depletion capture | Cost accounting |

**Future inventory expansion** may deepen catalog, receiving, and ordering — as **extension** of this capability, not a separate product.

---

## Users

| User | Role |
|------|------|
| **Employee** | Report short at point of use |
| **Supervisor** | Mitigate — borrow, substitute |
| **Manager** | Authorize scope reduction; escalate supply |
| **Storeroom** (role) | Stage, deliver, receive |

---

## Relationships

| Capability | Relationship |
|------------|--------------|
| **Operation Readiness** | Supply is readiness input |
| **Operation Execution** | Resources consumed during execution |
| **Issue and Recovery** | Shortages trigger recovery |
| **Asset and Location** | Storage locations hold supply |
| **Operational Intelligence** | Shortages in awareness |
| **Analytics** | Chronic shorts, delivery reliability |

---

## Operational rules

1. **Point-of-use truth** — shortage reported where noticed beats warehouse guess.
2. **Operation-scoped need** — today's menu drives criticality.
3. **Shortage is operational** — appears in readiness, not only supply module.
4. **Substitute is recovery** — documented variance, not silent swap.
5. **PAR is operational minimum** — configurable per location type.
6. **Depth scales with maturity** — core: report short; later: full PAR tracking.

---

## Success criteria

| Criterion | Measure |
|-----------|---------|
| **No silent stockouts** | Shorts surface before service stops |
| **Recovery linkage** | Short triggers visible action |
| **Floor speed** | Report in seconds |
| **Criticality accuracy** | Block only when truly blocking |
| **Improvement** | Repeat shorts decrease |

---

## Future extensibility

- **Delivery integration** — expected vs received.
- **Auto-depletion** from execution volume.
- **Org-wide catalog** — operator standard items across sites.
- **Vendor ordering** — workflow extension.
- **Full inventory** — enterprise maturity layer.
- **Recipe/bill-of-materials** — menu-driven demand (dining depth).

---

## Industry examples

| Industry | Critical resource examples |
|----------|---------------------------|
| LTC | Tray domes, sanitizer, texture-mod ingredients |
| Hospital | Allergen-free labels, isolation kits |
| K-12 | Milk, disposable trays, gloves |
| University | Grab-and-go packaging, coffee cups |
| Corporate | Stock cups, utensils, labels |
| EVS | Chemical, liners, PPE |
| Plant | Filters, refrigerant (operational trigger) |
| Laundry | Bags, detergent, linen par |
| Hospitality | Event-specific disposables, garnish |

---

## Experience alignment

Surfaces through [Unit Workspace](../reference-ux/02_UNIT_WORKSPACE.md), [Operations Center](../reference-ux/01_OPERATIONS_CENTER.md), and [Operational Recovery](../reference-ux/07_OPERATIONAL_RECOVERY.md).

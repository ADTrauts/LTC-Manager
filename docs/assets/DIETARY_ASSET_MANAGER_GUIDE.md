# Dietary Asset Manager Guide

**Phase:** 10A — Dietary Asset Operations  
**Audience:** Managers and GMs with Dietary operational authority  
**Flag:** `DIETARY_ASSET_OPERATIONS_ENABLED=true`

## What you manage

Dietary Assets are physical equipment (refrigerators, dishwashers, holding cabinets, etc.) registered once in the Facility Asset registry — not a second catalog.

## Create an Asset

1. Open **Assets**.
2. Enter code, name, equipment type, Unit, Department, identifying fields (manufacturer, model, serial, facility Asset number).
3. Set initial status to **Operational** (or Degraded / Out of service if already known).
4. Optionally assign a preferred Facility Vendor.
5. Save — an initial status history entry is recorded.

## Asset profile

Open an Asset to review, in separate sections:

- **Identity** — location, Department, identifiers  
- **Current condition** — operational status and criticality  
- **Operational Evidence** — recent linked readings / checks  
- **Issues** — open and recent Asset Issues  
- **Work Orders** — active and recent repairs  
- **History** — durable timeline with links to source records  

## Change status

Use the authoritative status action on the Asset profile:

- **Operational** — available for normal use  
- **Degraded** — usable with known limitation / workaround  
- **Out of service** — not available  
- **Retired** — permanently removed from prospective use  

Status changes are append-preserving. Completing a Work Order never silently restores **Operational** — you must confirm return to service explicitly.

## Retire an Asset

Retire with reason when equipment leaves service. Historical Evidence, Issues, and Work Orders remain. Retired Assets cannot receive ordinary new prospective requirements.

## Vendors

Manage Facility-scoped Vendors under **Assets → Vendors**. Foreign Vendor IDs are rejected. There is no Vendor portal in Phase 10A.

## Work Orders

From an Issue (or directly when authorized): create a Work Order, assign responsible party / Vendor, move through lifecycle (assigned, in progress, waiting on parts/vendor, on hold, completed, cancelled). Record work performed and resolution. Mark return-to-service ready on the WO if appropriate, then explicitly return the Asset to **Operational**.

## What Phase 10A does not include

Full Plant Operations, preventive-maintenance engine, inventory/parts, purchase orders, Vendor portal, automatic Work Orders from Evidence, EVS, or financial asset accounting.

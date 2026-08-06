# Dietary Operational Template — Manager Guide

Phase 9C unified Operational Template Builder for Dietary Logs, Checklists, and Inspections.

## Enable locally

```
DIETARY_OPERATIONAL_CYCLES_ENABLED=true
DIETARY_JOB_FLOW_ENABLED=true
DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true
OPERATION_ENGINE_ENABLED=false
```

## Open the Builder

`/staffing/templates` (Manager/GM password; Supervisor may view).

## Create from preset

Use **Create draft from preset** for:

- Cooler Temperature Log  
- Dishwasher Sanitizer Log  
- Opening/Closing Checklist  

Presets are always Drafts. They are never auto-published.

## Publish

Review fields, applicability (Asset/Space), and schedules (cycle keys or fixed windows). Publish creates an immutable version used by Runtime.

## Retire

Retiring stops prospective requirements. Historical Evidence Records remain readable with the original Template version snapshot.

## What employees see

Only published requirements for their Assignment Unit, applicable Assets/Spaces, and current/upcoming cycles appear in Job Flow. Drafts never appear.

## What this is not

Not a general document platform, not automatic Assignment generation, not Operations Engine, not EVS/Plant.

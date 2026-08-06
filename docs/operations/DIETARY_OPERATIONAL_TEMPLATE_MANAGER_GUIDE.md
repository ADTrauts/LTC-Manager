# Dietary Operational Template — Manager Guide

Phase 9C / 9C.1 unified Operational Template Builder for Dietary Logs, Checklists, and Inspections.

## Enable locally

```
DIETARY_OPERATIONAL_CYCLES_ENABLED=true
DIETARY_JOB_FLOW_ENABLED=true
DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true
OPERATION_ENGINE_ENABLED=false
```

## Open the Builder

`/staffing/templates` (Manager/GM password; Supervisor may view).  
STAFF cannot open the Builder. Quick PIN never grants Build. Facility Administrator alone without Dietary primary department is denied.

## Blank Template creation

Use **Blank LOG**, **Blank CHECKLIST**, or **Blank INSPECTION** to start an empty Draft. Configure name, purpose, instructions, and allow-ad-hoc before publishing.

## Field editor

Add, edit, remove, and reorder fields:

- Short text, Long text, Number, Temperature  
- Yes/No, Pass/Needs Attention  
- Single select, Multi-select  
- Date, Time, Attestation, Optional comment  

Per field: label, help text, required, units, min/max, selection choices, corrective-action trigger, corrective-action required. Validation runs before Save or Publish.

## Validation and corrective action

Out-of-range Number/Temperature (and configured Yes/No or Pass/Needs Attention triggers) surface corrective action on the tablet. When corrective action is required, submission is blocked until text is provided.

## Applicability

Select Specific Asset, Asset type, Specific Space, Space type, or Unit. Scope is Facility + Dietary Department. Retired Assets/Spaces are not offered. Published historical applicability is immutable (edit via successor version).

## Scheduling

Configure Operational Cycle references (by published `stableKey` — times remain owned by Cycles), fixed Facility-local windows, once per operational date, and/or allow ad-hoc. Do not copy UnitMealTime into the Template.

## Preview

Draft preview shows representative field layout, validation/corrective behavior, and matched Assets/Spaces for a selected operational date and Unit context.

## Publish

Publish validates the entire Template, creates an immutable published version, and makes requirements prospectively visible. Prior published versions of the same `stableKey` are retired on supersede. Drafts never appear in Job Flow.

## Successor version

From a published Template, **Create successor** opens a new Draft with the same `stableKey` and next version. Edit fields/applicability/schedules, preview, then publish. Prior Evidence retains its original `templateSnapshotJson`.

## Retire

Retire requires confirmation. Records actor and time. Stops new prospective requirements. Historical Evidence and Log Book remain readable with original version labels. Use status filters to view Retired Templates.

## Presets

Optional presets (Cooler Temperature, Dishwasher Sanitizer, Opening/Closing Checklist) create editable Drafts only — never auto-published.

## What employees see

Only published requirements for their Assignment Unit, applicable Assets/Spaces, and current/upcoming cycles appear in Job Flow. Offline submissions show **Saved on This Tablet** until synchronized.

## Legacy

Legacy `/logs` and `/admin/inspections` remain separate. New Dietary evidence uses Operational Templates on `/staffing/templates`.

## What this is not

Not a general document platform, not automatic Assignment generation, not Operations Engine, not EVS/Plant.

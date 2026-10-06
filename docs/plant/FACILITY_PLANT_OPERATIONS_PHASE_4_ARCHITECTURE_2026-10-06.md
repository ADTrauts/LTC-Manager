# Facility Plant Operations — Phase 4 architecture addendum

**Date:** 2026-10-06  
**Mode:** PLAN addendum (authoritative refinements for implementation)  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)

Facility Plant Operations remains **DEVELOPMENT**.

Two refinements override the original Phase 4 PLAN on these points:

## 1. Asset RETIRED does not retire the PM Plan

Asset lifecycle and PM Plan lifecycle are different facts.

- Asset `RETIRED` → generation ineligible; no new occurrences while retired; history and open Work Orders remain; Plan status is unchanged.
- If the Asset returns to an active lifecycle and the Plan is still `PUBLISHED`, future eligible obligations resume without republishing.
- Plan `RETIRED` is an explicit configuration action by an authorized Builder.

## 2. Do not pre-materialize 12 months of occurrences

Future dates may be **projected** in memory for Build/Run preview.

A `PreventiveMaintenanceOccurrence` row is created only when the scheduled civil date enters the governing version's generation-lead window (`scheduledDate - generationLeadDays <= facilityToday`), or through an explicit later operation such as skip.

At materialization, `occurrence.planVersionId` is frozen and never changes.

## Deferred to Phase 4B

- Occurrence generator / cron
- Preventive Work Order generation
- Active Work Order partial unique index
- Skip operational flow
- Build UX / Run UX

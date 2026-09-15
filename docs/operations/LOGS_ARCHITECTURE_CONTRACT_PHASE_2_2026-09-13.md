# Logs Architecture Contract — Phase 2

**Date:** 2026-09-13  
**Status:** Implementation-ready contract (no final UX, no migration 83)  
**Canonical model:**

> **LTC Corp Catalog → Facility Log Attachment → Derived LogRequirement → Log Submission (`OperationalEvidenceRecord`)**

Code contract: `src/lib/logs-architecture/`

---

## 1. Confirmed stacks (do not reopen)

| Stack | Path | Role going forward |
|-------|------|--------------------|
| Legacy | `LogTemplate` → `LogAssignment` → `LogSubmission` | Compatibility during cutover |
| Phase 9C | `OperationalTemplate` → Applicability/Schedule → EvidenceRequirement → `OperationalEvidenceRecord` | Field/schedule/submission DNA; facility templates transitional |
| Inspections | `InspectionDefinition` → Occurrence → Submission | **Separate domain** — reuse patterns only |

Do **not** create a fourth parallel Logs engine.

---

## 2. Catalog definition

**Name:** `CatalogLogDefinition` (lineage via `stableKey` + `version`)

**Owns:** fields, units (`unitLabel`), ranges, exception/CA rules, instructions, recommended cadence, purpose (`LOG` | `CHECKLIST`), category, suggestion metadata, version lifecycle.

**Must not own:** facility IDs, asset/space/unit IDs, local meal times, department assignments.

**Purpose umbrella:** Catalog includes `LOG` and `CHECKLIST`. Work Engine Inspections stay outside.

---

## 3. Catalog ownership

**Owner scope:** `PLATFORM` (LTC Corp).

There is no existing global definition table. `Organization` is tenancy parent of `Facility` but is not used as a content catalog today.

**Minimal contract:** Catalog rows have **no `facilityId`**. Facility users never author Catalog. Facility BUILD only attaches published Catalog versions.

Phase 9C `OperationalTemplate` remains **facility + department** owned and must not be mislabeled as Corp Catalog.

---

## 4. Catalog lifecycle / versioning

```
DRAFT → (review) → PUBLISHED (immutable) → RETIRED
```

- `stableKey` = logical Log across versions  
- Edits create successor versions  
- Attachments pin `catalogVersion` for prospective use  
- Submissions store snapshot (`templateSnapshotJson` evolved to `LogSubmissionSnapshot`)  
- Catalog changes never rewrite historical submissions  

Corp authoring ≠ facility Attachment activation.

---

## 5. Fields / validation / corrective action

Reuse Phase 9C field engine (`OperationalEvidenceFieldType` + min/max + selections + CA trigger/required).

**CA contract:** exception → submission exception state → CA text in same submission when required.  
**Do not** auto-create AssetIssue / Repair / OperationalRequest.

---

## 6. Suggestions vs Attachment

| Kind | Disposition |
|------|-------------|
| `SPECIFIC_ASSET` / `SPECIFIC_SPACE` / `DEPARTMENT_UNIT` | Operational target (maps to Attachment) |
| `ASSET_TYPE` / `SPACE_TYPE` | **Suggestion / bulk-selection only** |

Type expansion must not silently create RUN requirements for new Catalog Attachments. Existing Phase 9C expand behavior remains compatibility until cutover.

---

## 7. Log Attachment

**Name:** `LogAttachment`  
**Owns:** facility, department, catalog pin, target, timing, active/inactive/retired, effectiveFrom/To, local label/instructions, needsSetup.

**Identity:** own `id` + `stableKey` (not CatalogId+target composite).

**Targets (V1):** Asset, Space, Unit, Department. Facility shape allowed but **deferred from default V1 UX**. Floor is **not** a target (bulk selector only).

**Target representation:** discriminated columns (`targetKind` + exactly one of `assetId` / `spaceId` / `unitId` / `targetDepartmentId`) — Prisma-safe FKs.

**Multiples:** same Catalog → many Attachments (e.g. 17 coolers).  
**Duplicate rule:** reject second **Active** Attachment with same Catalog + target + timing fingerprint; prefer one Attachment with multiple windows over morning/evening duplicates.

**Overrides (narrow):** label, instructions, timing/cycles, active/effective dates.  
**Not allowed in V1:** rewriting Catalog fields/ranges; facility custom forms.

**Versioning (V1):** stable Attachment identity; prospective effective config; no full event sourcing.

---

## 8. Timing

| Source | Notes |
|--------|-------|
| Catalog default | Recommended cadence → default daypart windows when safe |
| Daily windows | Labeled start/end (Morning/Afternoon/Evening) |
| Operational Cycle | `cycleStableKey[]` → published Department cycles |
| Calendar | DAILY/WEEKLY/MONTHLY (Inspection cadence concepts, not Inspection domain) |
| Ad hoc | Manual initiate; Phase 9C `allowAdHoc` |

**Meal Period / `MealType` is not a timing authority.** Breakfast/Lunch/Dinner are cycle names.

**Cycle versions:** Attachment stores `stableKey`; RUN resolves current published version. History snapshots timing context. Missing key → **Needs setup** (no silent remap).

**Key Times:** milestones only; no Attachment relation in V1.

**Dayparts (V1):** Attachment-local labeled windows with platform default clocks for Catalog DEFAULT resolution (`DEFAULT_DAYPART_WINDOWS`). Not a shared Daypart table yet.

### Default application

Attach → operational immediately when defaults resolve (e.g. Twice daily → Morning + Afternoon).

### Needs setup

Only when unsafe: no published cycles but cycle timing required; selected cycle missing; invalid windows/calendar; missing target context.

### Service-day boundary

Config changes are prospective. Prefer facility service-date activation (`effectiveFrom`) so mid-service published requirements do not silently rewrite without explicit facility action. Detail for Phase 3 resolver: resolve against Attachment config effective for the operational date.

---

## 9. Derived LogRequirement

Ephemeral read-model (Phase 9C EvidenceRequirement pattern + Attachment identity).

Answers: Attachment, Catalog version, target, department, service date, window/cycle, product due state, satisfaction link.

**Generation:** deterministic, idempotent, facility-timezone, published/effective config only.

**Key:** `buildLogRequirementKey` = Attachment stableKey + Catalog + schedule + target + date.

**Satisfaction:** one Evidence record per scheduled requirement key; ad hoc may not match a scheduled key.

---

## 10. Canonical submission store

**DB:** `OperationalEvidenceRecord` (+ values + corrections).  
**Product language:** Log submission / Log record.  
**Do not** create a new LogSubmission table for canonical Logs.  
**Offline:** keep `SUBMIT_OPERATIONAL_EVIDENCE`.  
**PIN:** submit yes; Catalog/Attachment Build no.

**Snapshot must include:** Catalog version/fields, Attachment identity/config, target, department, timing context.

---

## 11. Due states (product)

| Product | Internal mapping |
|---------|------------------|
| Upcoming | `UPCOMING` |
| Due | `DUE` (+ offline pending as Due) |
| Overdue | `NOT_CONFIRMED` |
| Completed | `COMPLETED` |
| Completed with exception | `COMPLETED_WITH_CORRECTIVE_ACTION` / staff view of `NEEDS_REVIEW` |
| Needs setup | `NOT_CONFIGURED` |

**Needs review:** supervisor secondary flag; staff still see Completed with exception.

Window/cycle: Upcoming → Due at start → Overdue after end. Exception completion clears overdue.

---

## 12. Legacy cutover

| Phase | Behavior |
|-------|----------|
| A | Catalog/Attachment coexist; legacy writable |
| B | New Attachments → Evidence RUN only; legacy assignments still run |
| C | Legacy create deprecated / read-only |
| D | Legacy submissions preserved forever; unified history display optional |

**Template mapping classes:** MATCHES_CATALOG | FACILITY_CUSTOM | OBSOLETE_DUPLICATE (classify later).  
**Assignment mapping:** Unit → Unit Attachment; `PER_MEAL`/`mealType` → cycle selection required.  
**History:** do not rewrite `LogSubmission`; unify in UI later.

### Routes

| Route | Future role |
|-------|-------------|
| `/logs` | Compatibility RUN/BUILD → later history/redirect |
| `/staffing/templates` | Facility template compat — **not** Corp Catalog authoring for facility users |
| `/staffing/log-book` | Canonical RUN history foundation |
| `/admin/inspections` | Inspection domain only |

---

## 13. Schema recommendation

**Phase 2 migration count: 82 (unchanged).**

Migration **83 is required for Phase 3 persistence** of platform Catalog + facility Attachment (see `proposed-schema.ts`). Do not ship it until Phase 3 implements storage.

Optional additive Evidence columns: `attachmentId`, `attachmentStableKey`.

---

## 14. Freezes / non-goals

No Dashboard, Today’s Work, Assets UX, Repairs, Scheduler, final Catalog/Attachment/RUN UX, custom facility Log builder, Meal Period timing, Floor as target, fourth Logs engine.

---

## 15. Phase 3 first steps

1. Materialize Catalog + Attachment schema (migration 83) behind flags.  
2. Seed LTC Corp Catalog from presets (not facility-owned).  
3. Attachment create API + needs-setup/default timing.  
4. Requirement resolver Adaptation (Attachment-backed keys).  
5. Keep legacy `/logs` writable until Phase B.

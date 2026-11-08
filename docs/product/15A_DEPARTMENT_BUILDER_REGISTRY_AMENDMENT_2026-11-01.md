# Platform Primitives & Engines Registry Amendment — Department Builder

**Status:** Binding amendment to [15 — Platform Primitives & Engines Registry](./15_PLATFORM_PRIMITIVES_AND_ENGINES_REGISTRY.md)  
**Decision date:** November 1, 2026  
**Authority:** [Product Constitution amendment](./01A_DEPARTMENT_BUILDER_FOUNDATION_AMENDMENT_2026-11-01.md), [01B Phase 1](./01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md), and [16 — Department Builder Architecture](./16_DEPARTMENT_BUILDER_ARCHITECTURE.md)

This amendment exists because the October 29 registry still contains generic Work / Work Plan rows and the older Department Builder shape. Those rows are migration-era documentation after the November 1 product-owner decision. They must not be extended.

**Supersession — November 6–8, 2026.** Schema/models for Work and profiles were restored for compatibility (`e179c0d`). Registry Phase 1 edits mark those rows **Retired / compatibility-only**. Presence in Prisma is not permission to reuse them as owners.

---

## Registry corrections

### Context & Configuration

The canonical ownership remains:

| Primitive / composition | Owner | Rule |
|---|---|---|
| Physical Facility tree | Facility Builder | One Facility → Unit → UnitSpace tree. Never copy places per Department. |
| Department responsibility | Facility Builder | Explicit responsibility on canonical Units / UnitSpaces. Department Builder consumes it. |
| Department room classification | none | Retired November 2, 2026. Do not add Location Function, Operational Type, or archetype. Engines store canonical place ids. |
| Department Builder → Facility | Composition | Shows the Department lens over canonical places and other owners. Persists no shadow tree. |
| Operational scope | Read-only resolver | May filter canonical places. Does not own them. |

**Operational Area, Experience tree/catalog, Department location copies, and Zone-as-hierarchy are not primitives.**

### Operating Rhythm

The forward timing mechanism is:

```text
Operational Cycle
  → Phase
  → Key Point
```

It owns recurring Department timing. It does not own Records, staffing, PM cadence, or Menu rotation.

### Generic Work

The registry rows for:

- Work Plan
- Expected Work
- Work occurrence
- Product Work preset
- Work applicability

are **retired forward architecture**.

Existing code may remain temporarily for dependency removal. It is not a reusable owner for new features.

Do not replace these rows with a renamed Task / Activity / Duty / Routine primitive.

### Frontline composition

A frontline “my day” / Job Flow composition may read:

- current Shift/Assignment context
- current Cycle / Phase / Key Points
- due Records
- domain-specific actions such as Plant Work Orders / Preventive Maintenance
- place context and problems the viewer is authorized to see

It stores no merged operational facts and must not require generic Work Plans going forward.

### People & Coverage

The reusable ownership is:

```text
User
  → Employee at facility
    → Department
      → Team
        → Role
```

Employee Builder owns workforce organization. Department Builder → People & Coverage composes that organization with Shift / call-off / Assignment and derived Coverage.

Department Team is organizational. Operational eligibility is a separate qualification on the shared registry. Team identity must not own rooms, Cycles, coverage state, or a role. Department Job Role is removed.

Coverage is still derived. Shift and Assignment remain separate facts.

### Records

One Records engine remains canonical:

```text
CatalogLogDefinition
  → FacilityCatalogInstall
  → LogAttachment
  → derived requirement / slot
  → OperationalEvidenceRecord
```

A Record targets a canonical place, unit, Department, facility, or Asset. Operating Rhythm may supply timing. A Record never becomes generic Work, and it does not target a Location Function.

### Assets & Maintenance

One Asset registry remains canonical.

Facility Plant Operations Requests, Issues, Work Orders, and Preventive Maintenance remain explicit maintenance-domain capabilities. They do not inherit from or become generic Work.

---

## Updated extend-before-inventing test

Before adding a reusable mechanism, ask in this order:

1. Is this a physical-place fact? → Facility Builder / physical tree.
2. Is this recurring timing? → Operating Rhythm.
3. Is this something that must be documented? → Records.
4. Is this workforce identity/organization? → Employee Builder / Team / Role.
5. Is this day-of placement or need? → Shift / Assignment / Coverage.
6. Is this equipment/built-environment maintenance? → Request / Issue / Work Order / PM.
7. Is this a Product-specific capability already defined? → that capability.
8. If none fit, document the platform gap and stop for product-owner approval.

**“Use generic Work” is no longer a valid answer.**

---

## Forbidden additions after this amendment

In addition to the existing registry guardrails, do not add:

- a new reader/writer of generic Work Plans solely for new functionality
- a new Work preset
- generic Work Marketplace content
- a Task/Activity/Duty/Routine model that recreates generic Work
- a Department-specific physical tree or `DepartmentLocation`
- a Location Function, Operational Type, archetype, or Department room-classification model
- a Team-owned room hierarchy
- a Department-only Role system beside Employee Builder workforce roles
- a required Zone layer between Department and Facility places

When the old registry is next rewritten, its generic Work rows and examples should be removed rather than preserved as deprecated reusable primitives.

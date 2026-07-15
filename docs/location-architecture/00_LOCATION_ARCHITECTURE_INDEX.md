# Location & Responsibility Architecture — Index

**Status:** Phase 0 — Discovery and Planning  
**Scope:** Repository audit, model definition, implementation planning  
**Rule:** No production code or schema changes in this phase

---

## Documents

| # | Title | Purpose |
|---|-------|---------|
| 01 | Current Unit Model Audit | Every schema, application, and library dependency on Unit/UnitType |
| 02 | Location Hierarchy Options | Options A, B, C evaluated against the real codebase |
| 03 | Recommended Location Model | Selected architecture with rationale |
| 04 | Department Responsibility Model | How departments express capability and ownership at locations |
| 05 | Responsibility Inheritance Rules | Parent→child responsibility propagation and override behavior |
| 06 | Department Data Visibility | How active department filters location data on each surface |
| 07 | Domain Location Link Matrix | Which domain objects link to which location level |
| 08 | Route and PIN Compatibility | Route migration, PIN/tablet behavior, redirects |
| 09 | Migration and Rollout Plan | Staged implementation preserving the stable product |
| 10 | Location Model Certification | 12 mandatory questions answered |

---

## Key principles

1. **Additive, not rewriting.** Preserve every existing Unit record, route, and workflow.
2. **Unit already has hierarchy.** `parentUnitId` exists today. The question is how to formalize it.
3. **Responsibility is the hard problem.** Physical access must not automatically expose domain data.
4. **Department independence.** The physical model must not hardcode Dietary, EVS, or Plant.
5. **Stability first.** Prefer the option that delivers required behavior with the lowest regression surface.

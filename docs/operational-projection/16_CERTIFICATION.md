# 16 — Certification

## Purpose

Certify the Operational Projection Platform architecture (Wave 15A) as the runtime operating model for LTC Manager.

---

## Evaluation

| Dimension | Score | Note |
|-----------|------:|------|
| Architectural clarity | 9.5 / 10 | Projection defined constitutionally; clear is/is-not |
| Ownership | 10 / 10 | Filtering owned solely by Projection; engines keep live truth |
| Duplication removed | 9.5 / 10 | Single eligibility path; consumers adapters only |
| Performance | 9.0 / 10 | Batched source + pure resolve + revision cache; materialization deferred |
| Migration safety | 9.5 / 10 | Shadow mode, per-surface flags, fail closed, wrappers |
| Future expansion | 9.5 / 10 | New departments = profiles; Plant policy typed; AI consumes same spine |
| Manager mental model | 9.5 / 10 | Areas → Experiences authored once, shown as authored |
| Projection mental model | 9.5 / 10 | Derive once → adapt → overlay live |
| **Readiness (architecture)** | **9.4 / 10** | Ready for 15B domain model implementation |

---

## Direct answers (certification checklist)

1. **Projection** = deterministic ephemeral runtime snapshot of operational relevance; not authoring, not live truth, not persistence.
2. **Inputs** = Facility Builder + ACTIVE profiles + rooms/assignments + Plant policy + principal/permissions + vocabulary (labels) + optional focus; operation/time/assignments/AI are overlays or consumers — not structural eligibility (except declared Experience time-gates).
3. **Projected** = Areas, Experiences, tools, nav, workspace handles, action keys, domain query scopes — not live records.
4. **Live** = readiness, assignments, issues/assets/inspections/logs, AI, Work/Operations engines.
5. **Filtering owner** = Projection only.
6. **Rebuild** = structural triggers in `09`; not every operation/time/assignment tick.
7. **Caching** = revision-keyed L0–L2; never key on meal/issues/AI.
8. **Permissions** = resolved before, intersected during, enforced after; never expose hidden Experiences.
9. **Plant** = policy merge without fake assignments (`04`).
10. **AI** = consumes `AI_CONTEXT`; never invents room context.
11. **Performance** = one source load + pure resolve + scoped queries (`12`/`13`).
12. **Failure** = fail closed; no all-locations fallback (`14`).
13. **Consumers** = contracts in `15`.
14. **Migration** = dies/survives/wrappers + ordered waves in `15`.
15. **Program** = 15B→15L certification waves.

---

## Prerequisites satisfied

- Wave 14A Experience Registry exists.
- Wave 14B Operational Profiles + room resolver + Plant policy boundary exist.
- Wave 14C Department Administration can author/certify/activate profiles.
- Product homes/philosophy constrain placement.
- Prior location-projection engine boundary retained; capability-as-truth superseded.

---

## Approval gate

| Gate | Status |
|------|--------|
| Architecture (15A) | **Certified** |
| Implementation | **Authorized to begin at 15B only** — not by this docs commit alone without product schedule |
| Production runtime | **Unchanged** |

---

## Recommended Wave 15B

**Projection Domain Model** — contracts, revision tokens, feature flags, golden fixtures, test harness. No Sidebar/Locations/Workspace/loader production wiring.

---

## Certification statement

The Operational Projection Platform is certified as LTC Manager’s runtime operating system for composing operational surfaces. Department Administration owns HOW departments operate; Projection owns WHICH Areas and Experiences appear for whom, where, and with what query scopes; engines own WHAT is true now. Everything after this wave should consume Projection rather than implementing department-specific eligibility logic.

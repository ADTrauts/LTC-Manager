# 04 — Experience Contracts

## Decision

Every Experience exposes a **canonical contract surface**. Projection projects **contract descriptors**, not UI trees. Homes and engines consume contracts.

---

## Canonical contract set

| Contract | Required? | Purpose |
|----------|-----------|---------|
| **Identity** | **Required** | `experienceKey`, name, icon, version, category, eligible departments |
| **Configuration** | **Required** | JSON-schema-like config shape facilities may tune |
| **Query scope** | **Required** | How activation becomes domain `unitIds`/`spaceIds`/constraints |
| **Permission / actions** | **Required** if any mutate or sensitive read | Action keys + required permissions |
| **Workspace contribution** | **Required** | Shell sections + mount handles for Unit/Business Workspace |
| **Navigation contribution** | **Required** | Area-relative nav entries / deep links (may be empty list if dept-wide only) |
| **Readiness contribution** | Optional | Signal keys this Experience may feed |
| **Work / task contribution** | Optional | Work Engine mapping hints |
| **Toolbar / primary actions** | Optional | Header action descriptors |
| **AI context** | Optional | What may be summarized; sanitizer hints |
| **Analytics contribution** | Optional | Metric keys and grain |
| **Notification contribution** | Optional | Notification kinds + severity mapping |
| **Tool bindings** | Optional | Which tools + binding slots (log templates, forms, …) |
| **Relationship declarations** | Optional | Soft links to related Experiences |
| **Availability** | **Required** | Dependencies/flags; fail closed when unmet |

---

## Contract shape (architecture, not TypeScript)

```text
ExperienceContract
  identity
  configurationSchema
  availability
  queryScopeRules
  actions[]
  workspace
    sections[]          # anatomy declarations
    mountHandles[]
  navigation
    contributions[]
  readiness?
    signalKeys[]
  work?
    contributionKeys[]
  toolbar?
    actions[]
  ai?
    contextKeys[]
    momentHooks[]
  analytics?
    metricKeys[]
  notifications?
    kinds[]
  tools?
    bindings[]
  relationships?
    relatedExperienceKeys[]
    dependencyKeys[]      # soft: "usually used with"
```

---

## Required vs optional — ruling

**Always required:** Identity, configuration schema (may be empty object), availability, query scope rules, workspace contribution, navigation contribution (may emit zero entries).

**Conditionally required:** Actions/permissions when the Experience can mutate or expose sensitive data.

**Optional:** Readiness, work, toolbar, AI, analytics, notifications, tools, relationships.

An Experience with *only* identity and no workspace contribution is illegal — it cannot be composed into homes.

---

## Who fills contracts at runtime

| Stage | Fills |
|-------|-------|
| Catalog | Static contract definitions |
| Profile | Configuration values, tool template selections, enablement |
| Projection | Location bindings, principal-narrowed actions, query scope handles, presence |
| Home | Mounts UI for declared sections/handles |
| Engine | Live values for status/history/tasks |

Projection must not invent contracts missing from the catalog. Homes must not invent sections missing from the projected workspace contract.

---

## Versioning

- Catalog `version` bumps on breaking contract changes.
- Profiles pin to catalog keys; migration guides handle renames.
- Deprecated Experiences remain resolvable until profiles migrate; Projection may mark `deprecated` in diagnostics.

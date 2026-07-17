# 06 — Experience Tools Model

## Decision

**Tools are pluggable instruments embedded inside Experiences.**  
They are shared platform capabilities, owned as tool kinds by the platform, bound and configured per Experience (+ profile), and never top-level operational destinations.

---

## Tool kinds (canonical)

| Tool | Job |
|------|-----|
| **LOGS** | Recurring operational capture |
| **FORMS** | Structured one-shot / workflow capture |
| **KNOWLEDGE** | Contextual SOPs / guidance |
| **TASKS** | Actionable work items (often Work Engine dual-write views) |
| **RECORDS** | Durable operational records produced by the Experience |
| **CHECKLISTS** | Guided completion lists (may specialize FORMS/LOGS; treat as tool family) |
| **REPORTS** | Experience-scoped reporting views (tool-like; optional) |
| **AUTOMATION** | Declared hooks (alerts, escalations) — not free-form scripts |

Wave 14A shipped LOGS, KNOWLEDGE, FORMS, TASKS, RECORDS. CHECKLISTS / REPORTS / AUTOMATION are architectural extensions of the same model.

---

## Embedded · shared · pluggable · owned

| Question | Answer |
|----------|--------|
| **Embedded?** | Yes — always rendered inside an Experience shell section |
| **Shared?** | Yes — one tool platform; many Experiences bind it |
| **Pluggable?** | Yes — Experiences declare tool slots; bindings attach templates/definitions |
| **Owned?** | Tool *kind* = platform. Tool *binding* (which log template) = profile/config. Tool *records* = domain engine. Tool *visibility* = Projection ∩ permissions |

---

## Binding model

```text
Experience.tools = [LOGS, KNOWLEDGE, ...]

Profile / archetype config:
  LOGS → templateIds[], schedule hints
  KNOWLEDGE → collection/tag associations
  FORMS → formDefinitionIds[]

Projection:
  emits tool descriptors only if Experience projects
  and tool binding is active
  and principal may use tool actions
```

Unbound optional tools → section omitted (not an error). Required tool missing when Experience declares it mandatory → availability failure / diagnostic.

---

## Navigation rule

```text
Operational Area → Experience → Tool
```

Never:

```text
Module (Logs) → Page
```

Deep links may open a tool section directly but must retain Experience context (title, area, back path).

---

## Central libraries vs tools

- **Administration → Knowledge** may host the facility library.
- Floor users still encounter Knowledge **as a tool inside Experiences**.
- A department-wide Knowledge Experience (if catalogued) is for library browsing under Documentation — still not a global “Knowledge module” peer of Service.

---

## Forbidden regressions

- Top-level Logs nav as primary model.
- Tools filtering department visibility independently of Experiences.
- Experiences that are only a renamed tool with no operational meaning.

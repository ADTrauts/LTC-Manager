# 07 — Experience AI Model

## Decision

AI attaches to **Experiences** (and homes that aggregate them), never invents an independent operational graph. Every AI moment is grounded in projected Experience contracts + engine state.

---

## What every Experience may expose to AI

| AI context facet | Allowed? | Source |
|------------------|----------|--------|
| **Current state** | Yes (if declared) | Status/readiness/work signals in scope |
| **Outstanding work** | Yes | Incomplete logs, open tasks/issues in Experience scope |
| **History** | Yes (bounded) | Recent submissions/events via query scopes |
| **Knowledge** | Yes | KNOWLEDGE tool associations in scope |
| **Recommendations** | Assistive only | Derived from above; **must not** create work or due times |

Experiences without an `ai` contract simply omit AI Assist sections. That is valid.

---

## Experience AI contract

```text
ai:
  contextKeys[]       # what may be included in snapshots
  momentHooks[]        # e.g. RECOVERY_HINT, SHIFT_NOTE, BRIEF_SIGNAL
  sanitizerProfile     # align with existing AI snapshot allowlists
  forbids[]            # e.g. invent_due_times, mutate_records
```

---

## Home-level moments (unchanged product placement)

| Moment | Home | Experience role |
|--------|------|-----------------|
| Morning Brief | OC (+ Workspace peek) | Aggregate declared brief signals across projected Experiences |
| Shift Transition | Today's Work | Outstanding work across projected Experiences |
| Recovery Assistant | Issue detail | Issue’s related Experience context + knowledge |

Future assistants must bind to an existing home and Experience contracts — no chatbot zone.

---

## Rules

1. AI consumes Projection (`AI_CONTEXT`) then Experience AI contracts — never builds room context alone.
2. AI never creates Tasks/Issues/Logs.
3. Workspace remains cache-peek only for briefs.
4. Missing Projection → do not generate (`operational-projection/14`).
5. Recommendations cite sources (signals/records/knowledge ids) for auditability.

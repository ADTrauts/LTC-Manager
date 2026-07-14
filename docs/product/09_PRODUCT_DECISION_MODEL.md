# 09 — Product Decision Model

**Status:** Where new features should live  

---

## First filters

Before designing UI, answer:

1. **Which stage of the operating loop** does this serve? (Operations → Work → Execution → Verification → Knowledge → Improvement)  
2. **Which persona** owns the decision?  
3. **Would this violate Product Boundaries?** If yes — integrate, don’t own.  
4. **Can an existing home compose it** without a new zone?

---

## Decision tree — placement

```text
Is it facility setup / permissions / org structure?
  YES → Administration
  NO ↓

Is it a grounded AI compression of existing state?
  YES → Intelligence moment on the home that owns the context
        (OC brief, Today shift, Issue recovery, Workspace cached peek only)
  NO ↓

Is it “what should I personally do next?” for Manager+?
  YES → Business Workspace (Focus / Agenda / Quick Action) — compose only
  NO ↓

Is it site-wide “what is wrong right now?”
  YES → Operations Center
  NO ↓

Is it multi-location supervisor motion (walk/cover/handoff)?
  YES → Today's Work
  NO ↓

Is it do-the-work-here at a location?
  YES → Unit Workspace (+ logs/issues/inspections deep links)
  NO ↓

Is it historical review / export?
  YES → Review zone
  NO ↓

Is it domain record management (assets, employees, knowledge library)?
  YES → Existing module under Resources / People / Knowledge / Admin
  NO ↓

STOP — likely out of bounds or needs an ADR.
```

---

## Decision tree — engines vs homes

```text
Need a new rule about Ready / Needs Attention?
  → Extend Readiness profiles — do not hardcode in Workspace

Need a new time window for meals/service?
  → Operations Engine — do not invent clocks in UI

Need a new assignable work type?
  → Work Engine / Issue / Inspection / Log adapters — not a new inbox skin first

Need a summary of existing signals?
  → Prefer composing homes (Workspace/OC/Today) over new engines
```

---

## Decision tree — AI

```text
Would the AI create or refresh state from Workspace?
  → Forbidden (Workspace is cache-peek only)

Would the AI invent due times or urgency?
  → Forbidden

Does a READY cached brief already exist for facility+department+day?
  → Optional peek on Workspace; full surface stays OC

Is the moment tied to shift handoff?
  → Today's Work

Is the moment tied to issue recovery?
  → Issue detail
```

---

## Preference for consolidation

When two UIs answer the same persona question:

1. Keep the stronger home.  
2. Demote the other to a link or remove.  
3. Document the change in the constitution/roadmap.  

Example already resolved: Manager home = Workspace; OC remains glance.

---

## Required citations for new waves

Every future wave README or kickoff should cite:

- Constitution principles served  
- Capability touched  
- Home placement from this decision model  
- Explicit boundary: what was **not** chosen

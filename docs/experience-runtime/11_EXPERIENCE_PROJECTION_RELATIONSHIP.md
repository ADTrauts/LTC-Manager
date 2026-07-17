# 11 — Experience ↔ Projection Relationship

## Decision

Projection projects:

```text
Operational Areas
  → Experiences
    → Experience Contracts (descriptors / handles / scopes)
```

Projection does **not** project pages, modules, React trees, or engine record bodies.

---

## Lifecycle transitions

```text
1. REGISTRY
   Experience exists as catalog definition + contracts

2. OPERATIONAL PROFILE
   Facility department selects Experience into an Area,
   enables on archetypes, configures tools, certifies, activates

3. PROJECTION
   For facility + lens + principal + purpose:
     include Experience where room/dept/policy/permissions allow
     emit contract descriptors + query scopes + tool bindings

4. WORKSPACE / HOME
   Mount Experience shell from workspace contract
   at purpose-appropriate density

5. LIVE ENGINE
   Load/mutate records inside projected scopes
   Overlay status onto shell sections
```

Every transition is one-way for truth:

- Registry ↛ invented by facility  
- Profile ↛ physical rooms created  
- Projection ↛ persisted as SoR  
- Workspace ↛ eligibility invented  
- Engine ↛ Experience catalog authored  

---

## What Projection emits per Experience

From Wave 15A, affirmed here:

- `experienceKey`, `areaKey`, configuration  
- tools[], actionKeys[] (permission-narrowed)  
- locationBindings[]  
- queryScopeHandle  
- readinessSignalKeys[]  
- navigationContributions[]  
- workspaceHandles[] / section declarations  
- optional ai/analytics/notification handles  
- provenance  

---

## Clarifying “Projection projects Experiences”

Projection projects **activation + contract handles**, not the Experience implementation. The Experience Runtime (this package) defines how those handles mount and behave. Projection remains derivation-only (`docs/operational-projection/01`).

---

## Relationship graph (allowed)

Experiences may declare soft relationships:

```text
Meal Service
  related→ Temperature Monitoring
  related→ Production
  related→ Tray Accuracy

Tray Accuracy
  related→ Work Orders / Repairs   # escalate defects
```

Allowed:

- soft navigation links when both project;  
- “used with” hints for Admin;  
- AI context expansion within declared related keys **only if those Experiences also project**.

Forbidden:

- hard ownership (Meal Service does not contain Temperature Monitoring’s shell);  
- Projection auto-including related Experiences the profile disabled;  
- circular required dependencies that block activation.

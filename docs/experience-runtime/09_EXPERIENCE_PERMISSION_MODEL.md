# 09 — Experience Permission Model

## Decision

Permissions attach in a strict hierarchy. Experience activation is **not** authorization. Authorization is **not** Experience activation.

```text
Facility tenancy
  → Department lens entitlement
    → Experience activation (profile + Projection presence)
      → Action permission (RBAC)
        → Tool action permission (subset)
          → Room / Unit location access
```

All layers must pass for a mutating operation.

---

## Complete hierarchy

| Layer | Question | Owner |
|-------|----------|-------|
| **Facility** | Is this the active facility? | Tenancy / session |
| **Department** | May this principal use this department lens? | Role + dept access |
| **Experience** | Is this Experience active here (profile + Projection)? | Profile + Projection |
| **Action** | May this principal perform `experience.action`? | RBAC permission keys |
| **Tool** | May they use this tool action (submit log, open form)? | Tool action keys under Experience |
| **Room** | Is the physical target in projected + allowed Unit set? | Projection ∩ employee Unit access |

---

## Attachment rules

1. **Catalog** declares required permission keys per action.
2. **RBAC admin** grants those keys to roles — does not invent Experiences.
3. **Projection** intersects: omit Experiences/actions the principal cannot use.
4. **Loaders/mutations** re-check; never trust client Experience lists.
5. **PIN / locked device** narrows rooms; cannot broaden Experiences.

---

## Examples

```text
Submit temperature log
  Facility OK
  AND Dietary lens entitled
  AND Temperature Monitoring projects for this room
  AND permission temperature_monitoring.log.submit
  AND LOGS tool bound + allowed
  AND room in allowedUnitIds / projection scope
```

```text
View Meal Service overview
  ... read permission
  AND Experience projects
  (no tool needed)
```

---

## What disappears long-term

Module-route entitlements as the *primary* mental model. Routes remain for compatibility; entitlement language migrates toward Experience/action keys. Coarse route checks may remain as a safety net during migration.

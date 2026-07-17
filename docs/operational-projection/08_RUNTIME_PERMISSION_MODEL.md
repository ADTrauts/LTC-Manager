# 08 — Runtime Permission Model

## Decision

**Authorization remains authoritative outside Projection. Projection intersects permissions during resolution and never exposes hidden Experiences.**

Projection is operational scope, not a substitute for RBAC.

---

## Where permissions apply

```text
BEFORE projection
  - authenticate session / PIN
  - resolve facility tenancy
  - resolve role + route entitlements into principal.permissionKeys
  - resolve employee allowedUnitIds / lockedUnitId

DURING projection
  - intersect Experiences, tools, actions, nav contributions with permissionKeys
  - intersect physical scope with allowedUnitIds
  - drop Areas that become empty after intersection

AFTER projection
  - loaders re-check facility tenancy + enforce query scopes
  - mutations re-check action permissions (never trust client)
  - deep links re-resolve Projection include/exclude
```

### Can Projection expose hidden Experiences?

**No.** If the principal lacks permission for an Experience’s required actions/routes, Projection omits that Experience (or its forbidden actions). UI must not receive a “hidden but present” descriptor for privilege escalation via client inspection.

Coarse pattern:

```text
Experience active in profile
AND room in department scope
AND principal location access
AND permission intersection passes
→ emit Experience
```

Anything weaker is a defect.

---

## Separation of concerns

| Concern | Owner |
|---------|-------|
| What the department operates | Operational Profile |
| What this person may do | RBAC / employee access |
| Where it appears | Projection |
| What is true now | Engines |

Do not rename RBAC permissions to Experiences. Do not treat Experience activation as authorization.

---

## Facility Overview entitlement

Broad Facility lens only for entitled leadership/admin roles. Unentitled principals cannot request Facility lens to broaden department data.

---

## Client trust boundary

Never trust:

- client-supplied capability lists;
- client-supplied Experience keys as grants;
- client-supplied department IDs beyond session entitlement;
- “I can see it in the DOM” as authorization.

---

## Mutation path

Projection scopes **reads**. Writes still:

1. authorize action;
2. verify target physical node + Experience still project for principal;
3. enforce domain invariants.

A stale cached Projection must not allow writes outside current truth — mutations re-validate.

---

## Security posture checklist

- Route/action RBAC authoritative.
- Every server loader validates facility tenancy.
- Direct URL access resolves Projection for the target.
- Hidden nav ≠ access control.
- Fail closed on Projection repository failure.
- Plant policy cannot grant other departments’ Experiences.

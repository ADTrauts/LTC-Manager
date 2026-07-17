# 14 — Runtime Failure Model

## Decision

**Fail closed. Never fall back to all locations or Facility Overview.**

Empty is valid. Broad is unsafe.

---

## Failure cases

| Failure | Behavior |
|---------|----------|
| ProjectionSource repository error | Fail closed for department operational data; surface error/empty entitled home; log diagnostic |
| No ACTIVE profile for department | Empty projection + `PROFILE_MISSING`; admin CTA where appropriate; no capability guess |
| Unknown/inactive department lens | Empty + diagnostic; not Facility Overview |
| Missing archetype on assigned room | Non-actionable + configuration gap diagnostic |
| Unknown Experience key in profile | Should be impossible post-certification; ignore key, diagnostic, fail tests in CI |
| Plant policy misconfiguration | Omit policy coverage; diagnostic; do not copy assignments |
| Principal access yields zero nodes | Valid empty snapshot |
| Mismatched facility IDs | Reject |
| Partial domain loader failure | Surface degraded section; do not widen scope to compensate |
| Stale cache suspected after structural write | Revalidate; prefer narrow/empty over broad stale |
| AI_CONTEXT projection failure | Do not generate AI content |

---

## Safe mode

When feature flag `OPERATIONAL_PROJECTION_ENABLED` (name TBD in 15B) is off:

- legacy loaders remain;
- Projection code paths dormant.

When on but Projection fails:

- **Safe mode** = empty operational tree / deny focus — not legacy broad fetch — once a surface has fully cut over.
- During dual-run shadow: compare only; serve legacy until cutover gate passes.

Never mix “Projection failed → legacy all Units” after cutover — that reopens the security/visibility hole Projection exists to close.

---

## Graceful degradation

Allowed:

- show structural chrome with “configuration required”;
- hide Experience panels that are `unavailable`;
- show readiness unknown when overlay fails but scopes exist;
- section-level errors inside OC/Workspace.

Forbidden:

- showing another department’s Experiences to fill space;
- using Unit type to invent Meal Service;
- Plant policy fabricating responsibility rows as recovery.

---

## Operator messaging

Managers see product language (“Dietary profile not active”) not engine stack traces. Diagnostics carry codes for support.

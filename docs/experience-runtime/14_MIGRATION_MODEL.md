# 14 — Migration Model

## What disappears (as product concepts)

| Concept | Fate |
|---------|------|
| **Modules** as top-level IA | Retired → Areas + Experiences + tools |
| **Top-level Logs** | Tool inside owning Experiences |
| **Top-level Knowledge** as peer of Service | Tool + Admin library; optional Documentation Experience |
| **Capabilities** as configurable truth | One-way migrate → Experiences; then retire reads |
| **Unit-type heuristics** as eligibility | Replaced by Profile + Projection |
| **Per-home department `if` trees** | Replaced by projected Experiences |

---

## What survives

| Concept | Fate |
|---------|------|
| Facility Builder hierarchy | Unchanged |
| Routes `/unit/...`, domain URLs | Compatibility anchors |
| RBAC | Migrates toward Experience/action keys |
| Engines (Readiness, Ops, Work, domains) | Unchanged ownership |
| Wave 14A registry / tools | Grows into full contracts |
| Wave 14B/14C profiles + admin | Selection/config host |
| Wave 15A Projection architecture | Delivers Experiences |
| Homes (BW, OC, Today, Unit) | Compose Experiences |
| Admin Knowledge library | Remains admin surface |
| Assets/Repairs list pages | Become Experience-scoped module routes during migration |

---

## Compatibility wrappers

1. **Legacy capability → Experience translator** (already sketched in Wave 14A `compatibility.ts`) — migration/diagnostics only.  
2. **Module route → Experience scope adapter** — list pages accept Projection scopes.  
3. **Mount handle registry** — maps contract handles to components without hardcoding departments in homes.

---

## Migration order (product language)

```text
1. Certify Experience Runtime architecture (this wave)
2. Expand catalog contracts (implementation wave)
3. Projection emits contract descriptors (15B+)
4. Unit Workspace mounts generic shell
5. Retarget Logs/Knowledge UX into tools
6. Retire capability eligibility + module IA copy
```

Do not delete routes on day one — retarget meaning first.

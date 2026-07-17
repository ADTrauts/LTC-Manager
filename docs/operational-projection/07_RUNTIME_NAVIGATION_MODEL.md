# 07 — Runtime Navigation Model

## Decision

Navigation is a **consumer** of Projection. Top-level route zones and RBAC remain authoritative for route access. Location navigation and Experience discoverability consume Projection descriptors.

No route redesign is required to adopt Projection.

---

## Sidebar

Show **operational locations with enough physical ancestry to orient**, for the active department lens:

1. actionable nodes from Projection;
2. structural ancestors;
3. prune empty branches;
4. readiness chips from the same department projection (engine overlay);
5. employee/PIN Unit restrictions already applied in Projection;
6. locked-device behavior unchanged.

Do not:

- show the entire raw Facility Builder tree;
- show only a flat Unit list as the long-term model;
- filter Experiences inside Sidebar components.

### Sidebar view model (adapter)

```text
ProjectedSidebarNode
  physical ref
  label / levelLabel (vocabulary)
  href | null                 # route adapter owns URL construction
  presentation ACTIONABLE | STRUCTURAL
  readiness | null            # overlay
  areaSummaries?              # optional Area spine for dept nav chrome
  children[]
```

Projection does not own URL construction.

---

## Area-structured department navigation

Department Administration recertified navigation to use Operational Areas as the stable spine:

```text
Dietary
  Service → Meal Service, Meal Times, …
  Food Safety → Temperature Monitoring, …
  Equipment → …
```

Sidebar may render:

- **location tree** (places), and/or
- **Area → Experience** discoverability entries when purpose requires,

both sourced from the same snapshot. Modules as top-level peers are retired.

---

## Locations zone

Locations is the place-entry experience: projected tree for entering Unit Workspaces. Same eligibility as Sidebar; different chrome/purpose.

---

## Top-level Experience discoverability

Eventually:

```text
show Assets nav entry
  when role permits route
  AND active department projection contains an Assets-family Experience
```

Route authorization remains independent and server-enforced. A nav link never grants access.

---

## Deep links

Any direct link to Unit / room / domain record must:

1. authorize user + facility;
2. resolve Projection (`DEEP_LINK` purpose);
3. verify physical target + Experience are included;
4. load only corresponding query scope;
5. return existing not-found/denied if not included.

Hidden Sidebar items are never sufficient enforcement.

---

## Lens switching

When department lens changes:

- physical IDs stable;
- branches appear/disappear;
- readiness profile changes with department;
- workspace Experiences change;
- current destination remains only if still projected;
- else use entitled home selection — **not** Facility Overview fallback.

---

## Facility Overview

Entitled leadership may see complete placed hierarchy with **labeled** department states. Never used as fallback for unknown department, failed Projection, or denied location.

---

## Regressions to protect

- Staff/PIN cannot gain Units.
- Locked tablets cannot navigate elsewhere.
- `/unit` bookmarks remain valid.
- Staged/undesignated never appear.
- Readiness chips match active department projection.
- Empty branches absent.
- Default homes unchanged (Manager → Workspace, Supervisor → Today, Staff → Unit/Logs).

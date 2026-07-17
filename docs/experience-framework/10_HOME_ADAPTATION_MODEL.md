# 10 — Home Adaptation Model

## Decision

The **same Experience** mounts everywhere; **density and chrome** change by home. Homes do not fork Experience implementations.

---

## Density profiles

| Home | Density | Shows | Hides / demotes |
|------|---------|-------|-----------------|
| **Unit Workspace** | `FULL` | Complete shell | Little |
| **Business Workspace** | `COMPACT` | Overview, status, outstanding, primary actions | Tools full-run, long history |
| **Today's Work** | `ACTION` | Outstanding work, location context, assign/resolve | Knowledge, settings, reports |
| **Operations Center** | `STATUS` | Status/exception chips, counts, drill-ins | Full tools, settings |
| **Manager overview / BW health** | `COMPACT` + metrics | Overview + metrics cards | Floor capture UX |
| **Deep link tool focus** | `FULL` scrolled to tool section | Tool + header context | Unrelated secondary |

There is no separate “Manager Dashboard” product zone beyond Business Workspace / OC composition — avoid inventing a fifth home.

---

## Who decides what?

| Decision | Owner |
|----------|-------|
| **Density** | Home (purpose → density profile) |
| **Section ordering (meaning)** | Experience declaration |
| **Section inclusion at density** | Home profile ∩ Experience `supports` densites |
| **Layout template** | Layout contract for that density |
| **Card/widget presence** | Experience declaration + empty suppression |
| **Which Experiences appear** | Projection only |

Homes may **drop** optional sections for density. They must not **reorder** sections into a contradictory narrative (e.g., Settings before Overview) unless the Experience’s compact map explicitly declares it.

---

## Adaptation algorithm

```text
projectedExperiences = Projection(purpose)
density = homeDensity[purpose]
for experience in projectedExperiences:
  layout = experience.layout[density] ?? fallback
  sections = layout.sections ∩ experience.declared ∩ density.allowlist
  render shell(layout, sections, overlay)
```

# 06 — Navigation Model

**Status:** Post–Wave 12 navigation philosophy  
**Code:** `src/lib/nav-zones.ts`, department lens, route permissions  

---

## Permanent idea

Navigation is organized by **role + operational context**, not by database modules.

Modules (Logs, Repairs, Assets) remain reachable, but they are **not** the primary mental model.

---

## The four operational homes

```text
Business Workspace          Manager: “What should I personally work on next?”
        ↓ (when site exceptions needed)
Operations Center           “What is happening across the facility right now?”
        ↓ (when multi-location action needed)
Today's Work                Supervisor: “Where do I walk / cover / hand off?”
        ↓ (when standing at a place)
Unit Workspace              Floor: “What do I do here, now?”
```

### Business Workspace (`/workspace`)

| Belongs | Does not belong |
|---------|-----------------|
| Manager Focus, Agenda, Quick Actions | Full exception tables |
| Optional dept health / snapshot / activity | Analytics warehouse |
| Cached Morning Brief peek | AI generation / refresh |
| Links into OC, Today, Unit, Issues | Organization-wide rollups |

**Why it exists:** Managers need a calm personal start — Wave 2 made OC the glance; Wave 12 made Workspace the **home**.

### Operations Center (`/dashboard`, alias `/operations`)

| Belongs | Does not belong |
|---------|-----------------|
| Active operation header | PIN submission UX |
| Site pulse & exceptions | Preference customization shell |
| Meal boards, staffing gaps | Personal agenda crafting |
| Morning Brief (live surface) | Floor work queue |

**Why it exists:** Exception-first **site awareness** in ~60 seconds.

### Today's Work (`/today` + walk / coverage / handoffs)

| Belongs | Does not belong |
|---------|-----------------|
| Walk list by readiness | Facility admin setup |
| Coverage & call-downs | Full asset registry |
| Handoffs / shift transition moment | Manager preference editor |

**Why it exists:** Supervisor multi-location **motion** — not the same as OC’s glance.

### Unit Workspace (`/unit/[unitId]`)

| Belongs | Does not belong |
|---------|-----------------|
| Prioritized work queue | Cross-facility lists |
| Logs, servery marks, local issues/inspections | Nav zone administration |
| Unit readiness | Org management |

**Why it exists:** Execution at the point of service.

---

## Supporting zones (still real)

| Zone | Job |
|------|-----|
| **Locations** | Enter Unit Workspaces; readiness chips on rail |
| **Review** | Historical / secondary review (reports) — not daily home |
| **Administration** | Setup; never default home |

Department switcher is a **lens**, not a fifth product.

---

## Default homes (canonical)

| Role | Home |
|------|------|
| Manager / GM / FA | Business Workspace |
| Supervisor | Today's Work |
| Staff / Lead / PIN | Unit Workspace or Logs |

---

## Simplification recommendation (docs only)

Older product-reference text still says “Managers home on Operations Center.”  
**Update guidance to Workspace** while keeping OC as the deliberate exception glance.

Do not collapse Workspace and OC into one route — they answer different questions.

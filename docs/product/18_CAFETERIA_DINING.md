# 18 — Cafeteria Dining

**Status:** Department Product blueprint (accepted design discussion, November 24, 2026)  
**Release status:** **Not registered.** No Product row in `src/lib/department-products/registry.ts` yet. Do not treat as DEVELOPMENT, AVAILABLE, or customer-visible until the Product owner authorizes registry entry and the [implementation guide](./NEW_DEPARTMENT_PRODUCT_IMPLEMENTATION_GUIDE.md) checklist begins.  
**Platform contract:** [13 — Department Product](./13_DEPARTMENT_PRODUCT.md)  
**Builder contract:** [16 — Department Builder Architecture](./16_DEPARTMENT_BUILDER_ARCHITECTURE.md)  
**Dashboard declaration:** required before AVAILABLE — [Department Dashboard Contract](../dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md)  
**Sibling Product:** [Food and Nutrition](./13_DEPARTMENT_PRODUCT.md) (`HEALTHCARE_FOOD_NUTRITION` / install key `DIETARY`) — Healthcare resident / patient meal service. This Product is not a mode of that Product.

This blueprint captures the operating model for cafeteria, business dining, and higher-education food service: branded stations with their own rotating menus, station staffing, and dayparts — without resident tray or therapeutic-diet workflows.

---

## Product identity (working)

| Field | Working value | Notes |
|-------|---------------|--------|
| **Product name** | Cafeteria Dining | Commercial naming may change before DEVELOPMENT registration |
| **Canonical product key** | `CAFETERIA_DINING` | Working; finalize at registry entry |
| **Installation key** | `CAFETERIA` | Working; must stay stable once first install/entitlement exists |
| **Default Department name** | Cafeteria Dining | Facility may rename (for example “Café”, “Dining Services”) |
| **Industry / facility types** | Interim: `OTHER` / `OTHER` | Catalog metadata only. Classification today is only `HEALTHCARE` \| `OTHER`. Dual-install at a Healthcare facility is intentional and does not wait on new industry labels |
| **Domain capability** | Menus extension; no new domain engine | Reuse Menus the same way Food and Nutrition does. Prefer `domainCapability: null` plus `starters.menus` unless a typed cafeteria module proves necessary |
| **Cycle starter** | New cafeteria starter (not the dietary starter) | Dayparts include Overnight; not Breakfast/Lunch/Dinner resident meal structure alone |

Food and Nutrition remains the Healthcare Product for resident / patient meal operations. A facility such as Terrace View may install **both**: Food and Nutrition for resident service and Cafeteria Dining for the public / staff cafeteria. One employee may be `headEmployeeId` on both Departments; the Dashboard Department toggle already follows led Departments.

Operator companies (for example Metz) may run either or both Products under Contracted Department Authority. Separate customer accounts for separate contracts stay separate Organizations / Facilities.

---

## Blueprint

| Contract item | Cafeteria Dining |
|---------------|------------------|
| **Purpose** | Run a multi-station cafeteria or retail dining operation for a service date: which stations are open, what each station serves from its rotating menu, who is assigned to each station (including floaters and supervisors), and which food-handling Records are due — without resident identity, tray line, or therapeutic diet orders |
| **Place participation** | Facility Builder owns the physical cafeteria area and station spaces (`Unit` / `UnitSpace`). The Department receives responsibility and builds participation: which stations belong to this Product’s Rhythm, Coverage, Menus, and Records. Station = responsible `UnitSpace` with a local branded label (Villa Toscana, Metro Deli, Bravo!, Main Plate, Grill, Salad Bar, and so on). No Location Functions, no Station engine, no second room tree |
| **Operating Rhythm** | Layered dayparts as Cycles (working starter set: Breakfast, Lunch, Dinner, **Overnight**). Phases cover open / service / close within a daypart. Weekday and weekend shapes differ. Station open/close inside a daypart is not a second clock — it is Coverage time windows (and optional Key Points when “station opened / closed” must be recorded). Overnight is a **daypart**, not a station. Holiday and special days use an **alternate station set and hours** (a different operating profile for that service date), not merely thinner staffing of the normal set |
| **Work presets** | Do not define. Generic Work is retired. Station duties are Assignments, Records, and Rhythm — not Work Plans |
| **People / coverage needs** | Shared People, Coverage, and Assignments. Coverage stores need: role + station space + count + daypart and/or local time window. Assignments place a named employee on one or more stations for the service date. Floaters use multi-space Assignments or a floater role with a wider place set. Supervisors use supervisor roles with broader Coverage. Product role registry (at implementation) should favor station / production / retail labels over Puree, Call-Down Runner, and other resident-service roles |
| **Record definitions** | Shared Catalog food-handling forms (opening/closing, temperatures, sanitation, allergen / board checks as Catalog content). No resident diet-office or tray Records. Facility installs and attaches; the Product does not own a Records engine |
| **Assets used** | Shared Assets when equipment at a station fails (ovens, cold wells, POS-adjacent hardware as Assets when tracked). No cafeteria-only asset registry |
| **Issues / exception rules** | Equipment problems become Issues and, when Plant accepts them, Work Orders. Failed food-safety Records stay on the Record. An empty station is a Coverage / Assignment fact, not an Issue by default |
| **Domain-specific capabilities** | **Menus** — genuine Product extension already owned by the Menu domain. Prefer **one Menu per station**, applied to that station’s `UnitSpace`, with rotating cycle settings (`cycleLengthWeeks` 3 or 4), week/day/period items, and Cycle applicability for the cafeteria dayparts. Runtime continues to answer “which ACTIVE Menus apply at this exact place during this root Cycle on this service date?” Authoring may feel like one cycle book; persistence stays location-scoped. Do not invent a Station entity or a second menu catalog |
| **Run requirements** | Published daypart answers what service window is current. Job Flow / Space workspace show Assignment at the station, today’s Menu for that place, and Records due. Missing Menus or Coverage creates no invented shortfall beyond what those owners already derive when configured |
| **Historical / Audit questions** | For a past service date: which stations were in the day’s profile; who was assigned where; which Menu items applied at each station; which food-handling Records were completed, missed, or waived; which REQUIRED Key Points (if any) were recorded |
| **Starter content** | Unpublished cafeteria Rhythm starter (dayparts including Overnight; weekday/weekend notes in starter copy). Suggested Catalog food-handling forms. Optional Menu template / import path later (Marketplace Menu templates are an approved design, not required for first DEVELOPMENT). Nothing auto-publishes. No fake stations or people |
| **Facility-configurable values** | Cafeteria area and station places; station labels; daypart times; weekday vs weekend profiles; which stations participate per profile; Coverage counts and windows; Menu cycle length, anchor, and items; people and qualifications; local Department name |
| **Dashboard contributions** | Same capability family as Food and Nutrition where configured: locations/runtime, published cycles, coverage, people, Menus when offered, Records when canonical logs are on, shared maintenance. A GM who heads both Food and Nutrition and Cafeteria Dining sees both via the existing Department toggle. Exact capability keys and empty states are declared at Dashboard gate time — Products contribute capabilities, never dashboard UI |
| **Notification policy** | Shared Notifications & Attention. Expect Coverage at-risk/uncovered, Assignment changes, evidence failed, and Key Point overdue only when those facts and the production Scheduled Evaluation clock apply. No cafeteria-private delivery engine |
| **Platform-gap test** | Stations, rotating Menus, Coverage, Assignments, Rhythm dayparts, and Records are Platform mechanisms. **Not in this Product:** a Station engine, Location Functions, generic Work, resident/tray/diet-order models, catering/BEO engine, or a Product-private holiday calendar. **Known platform gap (separate conversation):** a facility-wide calendar / named-day profile so holidays and closures can select an alternate operating profile without manual per-Department boards. Until that exists, interim holiday handling is weekday/weekend published profiles plus a service-date Assignment / Coverage plan that names the reduced station set and hours |

---

## Operating model (from owner practice)

Reference shape drawn from Metz cafeteria operations (including Terrace View’s staff/public cafeteria beside resident Food and Nutrition):

1. **Facility** creates the cafeteria physical shell.  
2. **Department** takes responsibility and builds stations out as places.  
3. Each branded station has its own rotating meal content (commonly a 3- or 4-week cycle; seasonal books are Menu content, not a second Product).  
4. Staff are assigned to stations for the service date; floaters and supervisors cover multiple stations.  
5. Dayparts (including Overnight) frame the day; individual stations open and close inside those windows.  
6. Holidays usually close most stations and change hours — an alternate station set, not a thin copy of the weekday board.  
7. Food-handling Records still apply.  
8. **Catering** is out of V1 scope for this Product (candidate later Product or extension).  
9. **Facility calendar** is out of this blueprint; park for a platform discussion.

---

## Relationship to Food and Nutrition

| | Food and Nutrition | Cafeteria Dining |
|--|--------------------|------------------|
| Audience of service | Residents / patients | Guests, staff, students, retail diners |
| Places | Units, serveries, production rooms as configured for healthcare meal service | Cafeteria area and branded stations |
| Menus | Department Menus; healthcare meal structure | Per-station rotating Menus |
| Roles | Includes resident-service flavored roles | Station / retail / production oriented roles |
| Coexistence | May install alone or beside Cafeteria Dining | May install alone or beside Food and Nutrition |
| Shared GM | Supported via `headEmployeeId` on each Department | Same |

Do not stretch `HEALTHCARE_FOOD_NUTRITION` to cover cafeteria station retail. Doc 13 already states Food and Nutrition is not the generic solution for every food-service business.

---

## Explicit non-goals (this blueprint)

- Facility-wide holiday / closure calendar (platform follow-up)  
- Catering / BEO / event production as a first-class V1 capability  
- Resident, patient, tray, or therapeutic diet workflows  
- A Station primitive or Location Function  
- Generic Work Plans or Work presets  
- A second Menu catalog or Menu engine  
- Changing Food and Nutrition, EVS, or Plant release status, price, or sellability  

---

## Implementation gate (when authorized)

1. Confirm commercial name / keys with the Product owner.  
2. Register `CAFETERIA_DINING` (or finalized key) at **DEVELOPMENT** in the Product registry with Menus offered and a cafeteria cycle starter reference.  
3. Add assignment roles for this installation key; do not overload `DIETARY` roles as the Product identity.  
4. Fill Dashboard contribution declaration and write-manifest classifications for any new write entry points.  
5. Follow [NEW_DEPARTMENT_PRODUCT_IMPLEMENTATION_GUIDE.md](./NEW_DEPARTMENT_PRODUCT_IMPLEMENTATION_GUIDE.md).  
6. Do not mark AVAILABLE without the Dashboard release gate and Product-owner release decision.

Until step 2, this document is design authority only.

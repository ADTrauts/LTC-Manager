# Retired platform ideas

**Status:** Binding — 2026-09-25  
**Supersedes, as current product direction:** Operation entity / Operations Engine, Experience catalogs, industry packs.

July 2026 documents in this folder remain historical. Do not implement from them as if they were the live contract.

The live contract is:

```text
Facility room → Location Program → Runtime Location State → Locations / Dashboard / Review / location workspace
```

Department Builder is Overview · Locations · Teams. Capabilities enter a place from Harbor: install a published LOG/CHECKLIST onto the facility, then place it on a room or Facility type. A new department is a licensed lane plus that loop — not an industry pack and not a composed Experience profile.

| Retired | Do not | Use instead |
|---|---|---|
| **Operation entity** (`OperationDefinition` / `OperationInstance`, `OPERATION_ENGINE_ENABLED`) | Enable the engine. Add a thinner Operation table. Teach “the Operation” as a persisted object. | Department operational cycle + Runtime Location State answers (happening, covered, evidenced, wrong, next). |
| **Experience catalog** (Areas, Archetypes, Experience keys as programming) | Add Experiences onto rooms. Seed baselines from the catalog. Treat Experience keys as installable modules. | Harbor logs/checklists/inspections/procedures installed facility-wide, then placed on a room or Facility type. |
| **Industry packs** | `applyIndustryPack()`, K-12/hospital pack seeds, roadmap “Wave 13 Industry Configuration” as a program. | Licensed department + installable Harbor items. Neutral copy does not require a pack. |

The location workspace reads Runtime Location State. Cycle and evidence engines key off Location Program. Projection scope is facility + department responsibility + role. The Operation engine package and Experience shell are deleted. Prisma Operation* / Role-binding rows stay until a later migration. The leftover Experience catalog file is not a product registry — do not add keys. `applyIndustryPack()` is will-not-do.

**Current programming plan:** [../department-administration/13_LOCATION_PROGRAMMING_REALIGNMENT.md](../department-administration/13_LOCATION_PROGRAMMING_REALIGNMENT.md)

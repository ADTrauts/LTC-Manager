# Department Dashboard contract

**Status — CURRENT.** The Dashboard is a platform-owned composition. Products supply domain facts through shared capability resolution, attention mapping and authorized drill-downs. See [the Product blueprint](../product/13_DEPARTMENT_PRODUCT.md#department-product-blueprint).

## Composition rules

1. Platform cards live in [the card registry](../../src/lib/dashboard/cards/registry.ts). Product authors supply eligible facts and drill-down destinations. Product registry entries are data declarations.
2. Derive capabilities from the [current resolver](../../src/lib/dashboard/capabilities.ts). Start with eligible Departments and scope all reads by Facility, Department and viewer. Scope inside the query before limiting results. Reuse the same domain calculation for a card and its drill-down.
3. Map actionable owner facts to the shared attention contract. Use [existing mappers](../../src/lib/dashboard/attention-mappers/) as examples. Keep the authority check and business decision in the owner. A Dashboard summary creates no operational fact.
4. Preserve the distinction between unavailable, not configured, not applicable and a real exception. Missing configuration should produce setup guidance only where authorized.
5. Respect [operator authority](../contracted-departments/README.md). A Facility Administrator without Department operating authority has a view for a self-operated Department and a restricted summary for a vendor-run Department. Reuse the server resolver and classify any Department write in the [write manifest](../../src/lib/department-authority/write-manifest.ts).
6. DEVELOPMENT is excluded from customer views. AVAILABLE and eligible RETIRED installations can contribute. Shared cards depend on existing configuration and scope. Product-only cards need their real domain capability.

## Capability vocabulary

| Capability | Source |
| --- | --- |
| `locations.runtime` | Active Space responsibility and shared location composition |
| `cycles.published` | An effective published root Cycle for the service date |
| `coverage.planned` | Effective Coverage templates or current Assignments |
| `people.roster` | Active Department employee facts |
| `records.canonical`, `records.legacy` | Resolver states. Canonical Records is the forward path. Legacy state can surface setup guidance. |
| `maintenance.shared`, `plant.maintenance`, `plant.requests.filed` | Shared maintenance admission, Plant operability and active request routing |
| `menus`, `meal.milestones` | Menus offer and applicability, and the Food and Nutrition domain capability |

Generic Work and Location Function no longer supply Dashboard facts. Layout state and Team lenses compose owner data without changing authorization.

## Dashboard contribution declarations

| Product | Current contribution | Empty or gated behavior |
| --- | --- | --- |
| Food and Nutrition | Locations and Rhythm, staffing/Coverage and Records when configured. Menus and meal contributions come from Food and Nutrition owners. Drill into Space, Records, Coverage or the corresponding owner. | Missing Rhythm, menu applicability or requirements supplies no service expectation. |
| Facility Plant Operations | Authorized Requests, Asset exceptions, Work Orders and PM. Drill into the shared maintenance and Plant surfaces. | Plant has no mandatory Rhythm starter. Missing PM plan generates no occurrence. |
| Environmental Services | **Draft for release.** Reuse shared Locations, Rhythm, Records and Workforce capabilities where configured. Final attention and drill-down declarations remain part of EVS release. | Customer Dashboard excludes DEVELOPMENT. |

## Release gate

Before a new Product becomes AVAILABLE or advertises a new operational capability, review its contribution declaration and exercise it on synthetic staging. Cover configured and unconfigured states, denied Facilities and Departments, the actual operator/Facility Administrator and relevant vendor modes, and equality of scoped counts and drill-downs. For a new attention source, verify source scope, event policy and deduplication. Exercise the affected [Dashboard browser suite](../../scripts/verify/run-dashboard-browser.mjs) alongside the [required release checks](../engineering/LOCAL_DEVELOPMENT_AND_RELEASE.md).

[Prior version and checkpoint detail](https://github.com/ADTrauts/LTC-Manager/blob/9477ec0c0c103076935c4347978ac59e9207860c/docs/dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md).

# Documentation reconciliation gaps

## Verified scope

The reconciliation started from GitHub main `9477ec0c0c103076935c4347978ac59e9207860c`. The central guide, Builder and Product contracts, Dashboard contribution contract, and engine registry were checked against the active Prisma schema, registry and eligibility, install/reconcile path, Builder navigation, domain services and test entry points. The [inventory](DOCUMENTATION_STATUS.md) includes 501 documentation-tree files and 12 root and agent references. Review depth was targeted. Primary contracts and selected module guides were reconciled against code. Dated receipts, visual examples and legacy packages were classified by subject, index and provenance.

## Foundational material

| Foundation | Repository source and reconciliation |
| --- | --- |
| Vision and product scope | [Current Constitution](product/01_PRODUCT_CONSTITUTION.md) plus amendments supersede the [early vision](platform-vision/PRODUCT_CONSTITUTION.md) as the operating map. Earlier Operation/Task and Dietary-only proposals are historical. |
| Design philosophy | [Operational Philosophy](product/05_OPERATIONAL_PHILOSOPHY.md) and [reference design principles](product-reference/09_DESIGN_PRINCIPLES.md) preserve place-first operation and engine-backed surfaces. Older Operation and Experience examples are historical. |
| Operational language | [Language Guide](product/08_PRODUCT_LANGUAGE_GUIDE.md) retains current domain vocabulary. Retired Work, classification, and older home names occur in archival context. |
| Build architecture | [Department Builder](product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md), [domain owners](product/NEW_DEPARTMENT_PRODUCT_IMPLEMENTATION_GUIDE.md#3-reuse-the-owning-engines) and [Employee Builder](employee-builder/README.md) replace dated tab and legacy-template instructions. |
| Runtime architecture | The [Product guide](product/NEW_DEPARTMENT_PRODUCT_IMPLEMENTATION_GUIDE.md#2-register-and-exercise-the-product) points directly to current Job Flow, RLS, Dashboard and place-workspace owners. Older Experience-tree and projected Work designs are superseded. |
| UX interface architecture | [Dashboard contract](dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md) and [Constitution workspaces](product/01_PRODUCT_CONSTITUTION.md#operating-workspace-shell) establish the current shell. Older Operations Center, Business Workspace, Today's Work and visual drafts remain historical. |
| Platform technical architecture | [Engine registry](product/15_PLATFORM_PRIMITIVES_AND_ENGINES_REGISTRY.md) and [baseline](architecture/PRELAUNCH_CANONICAL_BASELINE_2026-11-11.md) anchor ownership and schema. The older [architecture assessment](architecture-review/README.md) remains evidence. |
| Governance | [Commercial model](product/11_COMMERCIAL_MODEL.md), accepted [authority decisions](contracted-departments/DECISIONS.md) and the [write manifest](../src/lib/department-authority/write-manifest.ts) remain governing sources. Eligibility and accepted policy determine customer operation. |

## Remaining work

- **Compiled guidebooks.** No compiled foundational PDF or editable guidebook source was located in the repository or the Codex workspace scan. The repository has numbered Markdown references and older domain guidebooks. Supply external sources/exports for comparison before regeneration. Any guidebook that teaches retired Work, location classifications, or superseded shells needs regeneration from reconciled source.
- **Role-facing manuals.** Dated Dietary, EVS, Plant, Assets, Work, and deployment manuals contain earlier workflow details. The register marks those with conflicting instructions. A later documentation effort can refresh the manuals against a synthetic walkthrough when onboarding or training needs them.
- **EVS release.** The [EVS status page](evs/README.md) specifies missing scope and certification. Internal implementation and an AVAILABLE commercial release are separate checkpoints.
- **Module depth.** This pass establishes engineering ownership and navigation for Records, Menus, Audit, and authorization. Dedicated current user manuals and complete persona-by-persona Audit guarantees remain separate work. Runtime and Audit claims should stay limited to the owner and workflow actually exercised.
- **Platform scheduling and delivery.** Scheduled Evaluation code exists. The repository [Vercel configuration](../vercel.json) declares Plant PM and Support automation. Shared sub-hour evaluator activation and external delivery require environment-specific evidence before they can be promised. Historical provider and job results are time-bound.
- **Delivery workflow.** Automatic protected Git Preview was verified at handoff. The prior documentation merge did not produce an observed automatic Production build. Use the [engineering guide](engineering/LOCAL_DEVELOPMENT_AND_RELEASE.md) and verify the exact staged release SHA at the next release checkpoint.

The canonical Product guide provides the reusable route to implement a new Product. The gaps above concern external artifacts, specific releases, or deeper manuals.

## Lightweight inventory check

Run this from a committed checkout after a documentation change. It checks that every tracked `docs/` asset has one entry and that every registered file still exists. Check updated links and anchors when editing a current contract.

```sh
node --input-type=module <<'JS'
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const inventory = readFileSync("docs/DOCUMENTATION_STATUS.md", "utf8")
  .split("## Tracked documentation tree")[1];
const entries = [...inventory.matchAll(/^\| \[.*\]\(([^)]+)\) \| [A-Z ]+ \|$/gm)]
  .map(match => "docs/" + decodeURIComponent(match[1])).sort();
const tracked = execFileSync("git", ["ls-files", "-z", "docs"], { encoding: "utf8" })
  .split("\0").filter(Boolean).sort();
assert.deepEqual(entries, tracked);
console.log(`Verified ${entries.length} documentation paths`);
JS
```

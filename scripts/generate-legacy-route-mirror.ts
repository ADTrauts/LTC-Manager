/**
 * Regenerate `prisma/legacy-route-mirror.json` from the platform route registry.
 *
 * The mirror is the only thing `prisma/seed.mjs` knows about route permissions, and
 * `src/lib/route-registry/legacy-mirror.test.ts` fails when the committed file and the registry
 * disagree. Run this after changing route access, then commit the regenerated file.
 *
 *   npm run route-mirror:generate
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildLegacyRouteMirror } from "../src/lib/route-registry/legacy-mirror";

const target = resolve(import.meta.dirname, "..", "prisma", "legacy-route-mirror.json");
writeFileSync(target, `${JSON.stringify(buildLegacyRouteMirror(), null, 2)}\n`, "utf8");
process.stdout.write(`Wrote ${target}\n`);

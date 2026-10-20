import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";
import { processPendingSupportAttachments } from "../../src/lib/support/scan-pending-attachments";
loadEnvConfig(process.cwd());
// Local proof defaults to disposable targets. Live operation requires separate explicit authorization.
if (!process.argv.includes("--allow-live")) assertDisposableDatabaseUrl(process.env.DATABASE_URL);
const db = new PrismaClient();
try { console.log(JSON.stringify(await processPendingSupportAttachments(db),null,2)); }
finally { await db.$disconnect(); }

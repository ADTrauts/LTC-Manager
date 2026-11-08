/** Deliver already queued dispatches through the existing sender. */
import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { evaluateExternalDelivery } from "@/lib/notifications/external-delivery";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

function load(path: string) {
  const into: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    into[trimmed.slice(0, i)] = trimmed.slice(i + 1);
  }
  return into;
}

const file = load(".env.n5dr");
assertDisposableDatabaseUrl(file.DATABASE_URL);
const parsed = new URL(file.DATABASE_URL);
if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/ltc_verify_n1a") {
  throw new Error("refusing non-disposable database");
}
process.env.DATABASE_URL = file.DATABASE_URL;
process.env.DIRECT_URL = file.DIRECT_URL;
process.env.VAPID_PUBLIC_KEY = file.VAPID_PUBLIC_KEY;
process.env.VAPID_PRIVATE_KEY = file.VAPID_PRIVATE_KEY;
process.env.VAPID_SUBJECT = file.VAPID_SUBJECT;
process.env.WEB_PUSH_SENDING_ENABLED = "true";

async function main() {
const db = new PrismaClient({ datasources: { db: { url: file.DATABASE_URL } } });
try {
  const before = await db.pushDispatch.findMany({
    where: { notificationRecipient: { userId: file.N5DR_USER_ID } },
    select: { status: true, attemptCount: true, lastErrorCode: true },
  });
  console.log("before", before.map((row) => `${row.status}:${row.attemptCount}:${row.lastErrorCode ?? "none"}`).join(" | "));
  const result = await evaluateExternalDelivery({ db, now: new Date(), facilityIds: [file.N5DR_FACILITY_ID] });
  const after = await db.pushDispatch.findMany({
    where: { notificationRecipient: { userId: file.N5DR_USER_ID } },
    select: { status: true, attemptCount: true, lastErrorCode: true, sentAt: true },
  });
  console.log("evaluator failures", result.failures);
  console.log(
    "after",
    after.map((row) => `${row.status}:${row.attemptCount}:${row.lastErrorCode ?? "none"}:sent=${row.sentAt ? "yes" : "no"}`).join(" | "),
  );
} finally {
  await db.$disconnect();
}
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "deliver failed");
  process.exit(1);
});

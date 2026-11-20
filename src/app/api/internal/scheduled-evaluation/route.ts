import { handleScheduledEvaluationCron } from "@/lib/scheduled-evaluation/cron";

export const dynamic = "force-dynamic";

/** Platform backstop. The whole pass shares a four-minute cooperative budget, with one minute of platform headroom. */
export const maxDuration = 300;

export async function GET(request: Request) {
  return handleScheduledEvaluationCron(request);
}

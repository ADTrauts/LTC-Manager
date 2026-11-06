import { handleScheduledEvaluationCron } from "@/lib/scheduled-evaluation/cron";

export const dynamic = "force-dynamic";

/** Platform backstop. The pass stops itself at the four-minute execution budget and releases the lease. */
export const maxDuration = 300;

export async function GET(request: Request) {
  return handleScheduledEvaluationCron(request);
}

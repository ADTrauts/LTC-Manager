import { handlePlantPmCron } from "@/lib/preventive-maintenance/cron";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handlePlantPmCron(request);
}

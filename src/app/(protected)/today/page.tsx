import { redirect } from "next/navigation";

/** DSH-04: Today's Work opens the Dashboard. */
export default function TodaysWorkHubRedirectPage() {
  redirect("/dashboard");
}

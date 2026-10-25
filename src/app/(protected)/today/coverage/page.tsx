import { redirect } from "next/navigation";

/** DSH-04: coverage lives on Schedule. */
export default function TodaysWorkCoverageRedirectPage() {
  redirect("/staffing");
}

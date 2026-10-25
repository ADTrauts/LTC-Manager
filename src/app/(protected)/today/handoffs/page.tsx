import { redirect } from "next/navigation";

/** DSH-04: handoffs live under People & Coverage. */
export default function TodaysWorkHandoffsRedirectPage() {
  redirect("/staffing/handoffs");
}

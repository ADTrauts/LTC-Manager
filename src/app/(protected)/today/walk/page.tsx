import { redirect } from "next/navigation";

/** DSH-04: the walk order lives on Locations. */
export default function TodaysWorkWalkRedirectPage() {
  redirect("/units?view=rounds");
}

import { redirect } from "next/navigation";

/** Legacy `/issues` list → canonical Repairs queue. */
export default function LegacyIssuesIndexRedirectPage() {
  redirect("/repairs");
}

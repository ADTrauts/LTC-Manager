import { redirect } from "next/navigation";

/** Legacy `/issues` list → canonical Repairs queue. Compatibility path only — not Issue authority. */
export default function LegacyIssuesIndexRedirectPage() {
  redirect("/repairs");
}

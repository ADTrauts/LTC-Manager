import { redirect } from "next/navigation";

/** The unit and meal grid is retired. Bookmarks open the Schedule. */
export default async function LegacyStaffingPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const date = typeof params.date === "string" ? params.date.trim() : "";
  redirect(date ? `/staffing?date=${encodeURIComponent(date)}` : "/staffing");
}

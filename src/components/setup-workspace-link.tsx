import Link from "next/link";
export function SetupWorkspaceLink({ role }: { role: string }) {
  return role === "FACILITY_ADMINISTRATOR" ? <Link href="/setup" className="inline-block text-sm font-medium underline">Return to site setup workspace</Link> : null;
}

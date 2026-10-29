import Link from "next/link";

export function SetupWorkspaceLink({ role, returned }: { role: string; returned?: string }) {
  if (role !== "FACILITY_ADMINISTRATOR") return null;
  if (!returned) {
    return <Link href="/setup" className="inline-block text-sm font-medium underline">Return to setup</Link>;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-300 bg-white px-4 py-3">
      <p className="text-sm font-medium">This builder is the setup step. The rest of the platform stays closed.</p>
      <Link href={`/setup?returned=${encodeURIComponent(returned)}`} className="app-button app-accent-button inline-block text-white">Back to setup</Link>
    </div>
  );
}

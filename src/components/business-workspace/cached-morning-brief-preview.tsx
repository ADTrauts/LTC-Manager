import Link from "next/link";

import type { WorkspaceCachedMorningBrief } from "@/lib/business-workspace";

/**
 * Compact read-only Morning Brief chip.
 * Never triggers generation — caller must supply a validated cached headline.
 */
export function CachedMorningBriefPreview({
  brief,
}: {
  brief: WorkspaceCachedMorningBrief;
}) {
  return (
    <aside
      className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3"
      data-testid="workspace-cached-brief"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Morning Brief · cached
      </p>
      <p className="mt-1 text-sm font-medium text-zinc-900">{brief.headline}</p>
      <Link
        href={brief.href}
        className="mt-2 inline-block text-sm font-medium text-zinc-800 underline"
      >
        Open in Operations Center
      </Link>
    </aside>
  );
}

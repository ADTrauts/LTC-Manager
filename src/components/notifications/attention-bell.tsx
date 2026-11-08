import Link from "next/link";

import { attentionBellCountText, attentionBellLabel } from "@/lib/notifications/center";

type AttentionBellProps = {
  count: number | null;
};

/**
 * Shell entry to the Notification Center.
 * A null count means the count could not be read. It is not a claim that nothing needs attention.
 */
export function AttentionBell({ count }: AttentionBellProps) {
  const label = attentionBellLabel(count);
  const shown = attentionBellCountText(count);

  return (
    <Link
      href="/notifications"
      aria-label={label}
      data-testid="attention-bell"
      className="relative inline-flex h-10 min-w-10 items-center justify-center rounded-md px-2 text-zinc-700 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
    >
      <BellMark />
      {shown ? (
        <span
          data-testid="attention-count"
          className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full border border-zinc-900 bg-white px-1 text-[11px] font-semibold tabular-nums leading-4 text-zinc-900"
        >
          {shown}
        </span>
      ) : null}
      <span className="sr-only">{label}</span>
    </Link>
  );
}

function BellMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 9H4c0-2 2-2 2-9Z" strokeLinejoin="round" />
      <path d="M10 20a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  );
}

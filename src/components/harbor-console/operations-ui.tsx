import type { ReactNode } from "react";
import Link from "next/link";

export function ConsolePanel({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return <section id={id} aria-label={title} className="scroll-mt-4 rounded-md border border-[var(--border)] bg-white p-5">
    <h2 className="text-base font-semibold">{title}</h2>
    <div className="mt-3 space-y-3 text-sm">{children}</div>
  </section>;
}

export function ConsoleFact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-1 border-b border-[var(--border)] py-2 last:border-0 sm:grid-cols-[12rem_1fr]">
    <dt className="text-[var(--text-secondary)]">{label}</dt><dd>{children}</dd>
  </div>;
}

export function ConsoleReadLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link prefetch={false} href={href} className="font-medium underline underline-offset-2">{children}</Link>;
}

export function ConsoleTimestamp({ value }: { value: Date | null }) {
  return value ? <time dateTime={value.toISOString()}>{value.toISOString().replace("T", " ").replace(/Z$/, " UTC")}</time> : <span>Not recorded</span>;
}

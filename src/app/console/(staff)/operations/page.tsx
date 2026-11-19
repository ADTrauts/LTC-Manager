import { redirect } from "next/navigation";

import { ConsolePanel, ConsoleReadLink, ConsoleTimestamp } from "@/components/harbor-console/operations-ui";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { harborOperationsHref, loadHarborOperations } from "@/lib/harbor-console/operations";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HarborOperationsPage({ searchParams }: {
  searchParams: Promise<{ queue?: string | string[]; scan?: string | string[]; page?: string | string[] }>;
}) {
  const session = await requireHarborStaff();
  const data = await loadHarborOperations(prisma, session, await searchParams);
  if (!data) redirect("/console/login");

  return <div className="mx-auto max-w-6xl space-y-6">
    <header>
      <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">Review exceptions, then continue in the owning service. Counts cover the full matching set; queues show up to 25 rows per page.</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">Snapshot: <ConsoleTimestamp value={data.observedAt} />. Reload to refresh.</p>
    </header>

    <nav aria-label="Operations queues" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {data.queues.map((queue) => <a key={queue.key} href={harborOperationsHref(queue.key)} aria-current={queue.key === data.selected.key ? "page" : undefined}
        className={`rounded-md border p-4 ${queue.key === data.selected.key ? "border-[var(--run-aside)] bg-[var(--surface-muted)]" : "border-[var(--border)] bg-white hover:bg-[var(--surface-muted)]"}`}>
        <span className="block text-sm font-medium">{queue.label}</span>
        <span className="mt-1 block text-xl font-semibold">{queue.total} <span className="text-xs font-normal text-[var(--text-secondary)]">{queue.unit}</span></span>
      </a>)}
    </nav>

    <ConsolePanel title={data.selected.label}>
      <p className="text-[var(--text-secondary)]">{data.selected.description}</p>
      {data.selected.key === "scanning" ? <nav aria-label="Scan scheduling filters" className="flex flex-wrap gap-3">
        <a href={harborOperationsHref("scanning")} aria-current={!data.scanStage ? "page" : undefined} className="underline underline-offset-2">All scan backlog</a>
        {data.scanStages.map((stage) => <a key={stage.key} href={harborOperationsHref("scanning", 1, stage.key)} aria-current={data.scanStage === stage.key ? "page" : undefined} className="underline underline-offset-2">{stage.label} ({stage.total})</a>)}
      </nav> : null}
      {data.scanStage ? <p className="font-medium">Filter: {data.scanStages.find((stage) => stage.key === data.scanStage)?.label}</p> : null}
      {data.selected.key === "pending" ? <p className="text-xs text-[var(--text-secondary)]">Outbound receipt credentials: {data.infrastructure.outboundReceiptsConfigured ? "present; callback delivery not verified" : "not configured here"}. Reply routing: {data.infrastructure.replyRoutingConfigured ? "configured; reachability not verified" : "not configured here"}. Missing configuration is not proof that a particular message failed.</p> : null}
      {data.selected.key === "catalog" ? <p>{data.canPublish ? "Your current login may publish authorized platform drafts after review." : "Your current login may browse and edit platform drafts. An Owner must publish."} <ConsoleReadLink href="/console/catalog">Open Marketplace</ConsoleReadLink></p> : null}
      {data.selected.key === "automation" ? <p><ConsoleReadLink href="/console/tickets/automations">Review automation rules</ConsoleReadLink></p> : null}
      {data.rows.length ? <>
        <p className="text-xs text-[var(--text-secondary)]">Showing {data.offset + 1}–{data.offset + data.rows.length} of {data.selected.total} {data.selected.unit}.</p>
        <ul className="divide-y divide-[var(--border)]">
          {data.rows.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="min-w-0 space-y-1"><h3 className="font-semibold">{row.title}</h3><p className="text-[var(--text-secondary)]">{row.detail}</p><p className="text-xs text-[var(--text-secondary)]"><ConsoleTimestamp value={row.occurredAt} /></p></div>
            <div className="flex flex-wrap gap-4"><ConsoleReadLink href={row.href}>{row.action}</ConsoleReadLink>{row.related ? <ConsoleReadLink href={row.related.href}>{row.related.label}</ConsoleReadLink> : null}</div>
          </li>)}
        </ul>
      </> : <p>No matching {data.selected.unit}. This is a queue result, not a provider health check.</p>}
      <nav aria-label="Operations pagination" className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-3">
        {data.page > 1 ? <ConsoleReadLink href={harborOperationsHref(data.selected.key, data.page - 1, data.scanStage)}>Previous</ConsoleReadLink> : <span />}
        <span>Page {data.page} of {data.pageCount}</span>
        {data.page < data.pageCount ? <ConsoleReadLink href={harborOperationsHref(data.selected.key, data.page + 1, data.scanStage)}>Next</ConsoleReadLink> : <span />}
      </nav>
    </ConsolePanel>

    <ConsolePanel title="Scanner and automation evidence">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="font-medium">Approved scanner configuration</dt><dd>{data.infrastructure.scanner === "configured" ? "Configuration accepted; provider reachability not checked" : data.infrastructure.scanner === "invalid" ? "Invalid configuration; downloads remain unavailable" : "Not configured; downloads remain unavailable"}</dd></div>
        <div><dt className="font-medium">Private object storage</dt><dd>{data.infrastructure.privateStorageConfigured ? "Credentials present; private provider integration not checked" : "Not configured"}</dd></div>
        <div><dt className="font-medium">Latest recorded scan attempt</dt><dd>{data.latestScan ? <>{data.latestScan.status} · <ConsoleTimestamp value={data.latestScan.finishedAt ?? data.latestScan.createdAt} /></> : "No recorded attempt"}</dd></div>
        <div><dt className="font-medium">Latest recorded Support automation run</dt><dd>{data.latestAutomation ? <>{data.latestAutomation.outcome} · <ConsoleTimestamp value={data.latestAutomation.occurredAt} /></> : "No recorded run"}</dd></div>
      </dl>
      <p className="text-xs text-[var(--text-secondary)]">Recorded attempts do not establish scheduler liveness or current provider health. No job runs, rescans, email sends, billing syncs, or downloads are triggered by this page.</p>
    </ConsolePanel>
  </div>;
}

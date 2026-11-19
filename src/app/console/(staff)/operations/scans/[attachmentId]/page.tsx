import { notFound, redirect } from "next/navigation";

import { ConsoleFact, ConsolePanel, ConsoleReadLink, ConsoleTimestamp } from "@/components/harbor-console/operations-ui";
import { peekHarborWorkFacilityId, requireHarborStaff } from "@/lib/harbor-console/auth";
import { elapsedAgeLabel } from "@/lib/harbor-console/presentation";
import { loadHarborScanDiagnostics } from "@/lib/harbor-console/scan-diagnostics";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HarborScanDiagnosticsPage({ params }: { params: Promise<{ attachmentId: string }> }) {
  const session = await requireHarborStaff();
  const [{ attachmentId }, workFacilityId] = await Promise.all([params, peekHarborWorkFacilityId()]);
  const data = await loadHarborScanDiagnostics(prisma, session, attachmentId, workFacilityId);
  if (data.kind === "unauthorized") redirect("/console/login");
  if (data.kind === "missing") notFound();

  return <div className="mx-auto max-w-5xl space-y-6">
    <header className="space-y-2">
      <ConsoleReadLink href="/console/operations?queue=scanning">Attachment scan backlog</ConsoleReadLink>
      <h1 className="text-2xl font-semibold">{data.ticketLabel} · attachment {data.attachmentPosition}</h1>
      <p className="text-sm text-[var(--text-secondary)]">Security scan diagnostics. No file contents or download are provided by this view.</p>
      <p className="text-xs text-[var(--text-secondary)]">Snapshot: <ConsoleTimestamp value={data.observedAt} />.</p>
    </header>
    <ConsolePanel title="Scheduling and current result">
      <dl>
        <ConsoleFact label="Current state">{data.schedule.label}</ConsoleFact>
        <ConsoleFact label="Time since receipt">{elapsedAgeLabel(data.createdAt, data.observedAt)}</ConsoleFact>
        <ConsoleFact label="Lease expires"><ConsoleTimestamp value={data.leaseExpiresAt} /></ConsoleFact>
        <ConsoleFact label="Next retry eligible"><ConsoleTimestamp value={data.nextScanAt} /></ConsoleFact>
        <ConsoleFact label="Last scan recorded"><ConsoleTimestamp value={data.scannedAt} /></ConsoleFact>
        <ConsoleFact label="Result code">{data.resultCode}</ConsoleFact>
        <ConsoleFact label="Current retry cycle">{data.cycle}</ConsoleFact>
      </dl>
      <p>The existing processor allows {data.policy.maxAttempts} attempts per cycle, leases for {data.policy.leaseSeconds} seconds, and waits {data.policy.backoffSeconds.join(" then ")} seconds between retries. Eligibility and an unexpired lease do not confirm a running worker.</p>
    </ConsolePanel>
    <ConsolePanel title="Recorded attempts">
      <p>Showing {data.attempts.length} of {data.attemptsTotal} attempts, newest first. No history is pruned here.</p>
      {data.attempts.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr>{["Cycle / attempt", "Status", "Result", "Started", "Finished", "Signature date"].map((title) => <th key={title} scope="col" className="p-2">{title}</th>)}</tr></thead>
        <tbody>{data.attempts.map((attempt) => <tr key={`${attempt.cycle}:${attempt.attempt}`} className="border-t border-[var(--border)]">
          <th scope="row" className="p-2 font-medium">{attempt.cycle} / {attempt.attempt}</th><td className="p-2">{attempt.status}</td><td className="p-2">{attempt.resultCode}</td>
          <td className="p-2"><ConsoleTimestamp value={attempt.createdAt} /></td><td className="p-2"><ConsoleTimestamp value={attempt.finishedAt} /></td><td className="p-2"><ConsoleTimestamp value={attempt.signatureUpdatedAt} /></td>
        </tr>)}</tbody>
      </table></div> : <p>No persisted scan attempt. This does not identify whether a processor is configured or scheduled.</p>}
    </ConsolePanel>
    <ConsolePanel title="Continue in the authorized workflow">
      <p><ConsoleReadLink href={data.conversationHref}>Review the original Support message and scan status</ConsoleReadLink></p>
      {data.implementationHref ? <p><ConsoleReadLink href={data.implementationHref}>Review the participating Implementation engagement</ConsoleReadLink>. Its source workflow rechecks participation and source ownership before accepting an explicit failed-source rescan request.</p> : <p>A failed-source rescan requires the existing authorized source workflow. This view does not grant participation or provide a general rescan command.</p>}
      <p className="text-[var(--text-secondary)]">The attachment processor is operated separately. This view does not run it, renew a lease, reset a retry cycle, or turn a blocked original into a downloadable file.</p>
    </ConsolePanel>
  </div>;
}

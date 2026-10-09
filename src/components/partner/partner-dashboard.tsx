import Link from "next/link";

import type {
  DashboardAssetsCard,
  DashboardCountLine,
  DashboardLogsCard,
  DashboardReviewCard,
  PartnerDashboardViewModel,
} from "@/lib/partner-dashboard/summarize-partner-dashboard";

function Lines({ lines }: { lines: readonly DashboardCountLine[] }) {
  return (
    <dl className="grid gap-2">
      {lines.map((line) => (
        <div key={line.id} className="flex items-baseline justify-between gap-4 text-sm">
          <dt className="text-zinc-600">{line.label}</dt>
          <dd className="font-medium text-zinc-900">{line.count}</dd>
        </div>
      ))}
    </dl>
  );
}

function Card({
  title,
  detail,
  href,
  action,
  children,
}: {
  title: string;
  detail: string;
  href: string;
  action: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-zinc-600">{detail}</p>
      <div className="mt-3">{children}</div>
      <Link href={href} className="mt-4 inline-block text-sm underline-offset-2 hover:underline">
        {action}
      </Link>
    </section>
  );
}

function ReviewCard({ card }: { card: DashboardReviewCard }) {
  return (
    <Card title="Review" detail="Evidence for today" href={card.href} action="Open Review">
      {card.unavailableMessage ? <p className="text-sm text-zinc-700">{card.unavailableMessage}</p> : null}
      {card.quietMessage ? <p className="text-sm text-zinc-700">{card.quietMessage}</p> : null}
      {card.lines.length > 0 ? <Lines lines={card.lines} /> : null}
    </Card>
  );
}

function LogsCard({ card }: { card: DashboardLogsCard }) {
  return (
    <Card title="Logs" detail="Current recording requirements" href={card.href} action="Open Logs">
      {card.emptyMessage ? <p className="text-sm text-zinc-700">{card.emptyMessage}</p> : null}
      {card.lines.length > 0 ? <Lines lines={card.lines} /> : null}
    </Card>
  );
}

function AssetsCard({ card }: { card: DashboardAssetsCard }) {
  return (
    <Card title="Assets" detail="Current Department-owned equipment" href={card.href} action="Open Assets">
      {card.emptyMessage ? <p className="text-sm text-zinc-700">{card.emptyMessage}</p> : null}
      {card.lines.length > 0 ? (
        <>
          <Lines lines={card.lines} />
          <p className="mt-3 text-sm text-zinc-700">
            {card.total} {card.total === 1 ? "asset" : "assets"}
          </p>
        </>
      ) : null}
    </Card>
  );
}

export function PartnerDashboard({ view }: { view: PartnerDashboardViewModel }) {
  return (
    <section className="space-y-4" data-testid="partner-dashboard">
      <div>
        <h2 className="text-lg font-semibold">Dashboard</h2>
        <p className="text-sm text-zinc-600">
          {view.departmentName} · {view.serviceDate}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {view.review ? <ReviewCard card={view.review} /> : null}
        {view.logs ? <LogsCard card={view.logs} /> : null}
        {view.assets ? (
          <div className="md:col-span-2">
            <AssetsCard card={view.assets} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

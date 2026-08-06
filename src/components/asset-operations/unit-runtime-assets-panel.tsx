import Link from "next/link";

import type { UnitRuntimeAssetItem } from "@/lib/asset-operations";

type Props = {
  assets: UnitRuntimeAssetItem[];
  unitId: string;
  canReport?: boolean;
  reportHref?: string | null;
};

export function UnitRuntimeAssetsPanel({
  assets,
  unitId,
  canReport = true,
  reportHref = null,
}: Props) {
  if (assets.length === 0) {
    return (
      <section
        className="rounded-md border border-zinc-200 bg-white p-4"
        data-testid="unit-runtime-assets-panel"
      >
        <h2 className="text-base font-semibold text-zinc-900">Asset status</h2>
        <p className="mt-1 text-sm text-zinc-600">No Assets listed for this Unit.</p>
      </section>
    );
  }

  return (
    <section
      className="rounded-md border border-zinc-200 bg-white p-4"
      data-testid="unit-runtime-assets-panel"
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Asset status</h2>
          <p className="text-xs text-zinc-600">
            Concise operational condition for this Unit.
          </p>
        </div>
        {canReport && reportHref ? (
          <Link
            href={reportHref}
            className="text-sm font-medium text-zinc-900 underline underline-offset-2"
            data-testid="unit-runtime-assets-report-link"
          >
            Report Issue
          </Link>
        ) : null}
      </header>

      <ul className="space-y-2">
        {assets.map((asset) => {
          const unavailable = asset.status === "OUT_OF_SERVICE";
          const degraded = asset.status === "DEGRADED";
          return (
            <li
              key={asset.assetId}
              className="rounded border border-zinc-200 px-3 py-2 text-sm"
              data-testid={`unit-runtime-asset-${asset.assetId}`}
              data-asset-status={asset.status}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-zinc-900">
                    {asset.assetCode} · {asset.name}
                  </p>
                  <p className="text-xs text-zinc-600">{asset.equipmentType}</p>
                </div>
                <span
                  className={
                    unavailable
                      ? "rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900"
                      : degraded
                        ? "rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
                        : "rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-800"
                  }
                >
                  {asset.statusLabel}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
                {unavailable ? <span>Unavailable</span> : null}
                {degraded ? <span>Degraded</span> : null}
                {asset.openImpactLabel ? <span>{asset.openImpactLabel}</span> : null}
                {asset.openIssueAlreadyReported ? (
                  <span data-testid={`open-issue-flag-${asset.assetId}`}>
                    Open issue already reported
                  </span>
                ) : null}
                {canReport ? (
                  <Link
                    href={`/unit/${unitId}?reportAsset=${asset.assetId}`}
                    className="font-medium text-zinc-900 underline underline-offset-2"
                    data-testid={`report-issue-${asset.assetId}`}
                  >
                    Report
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

import { AssetBulkImportPanel } from "./asset-bulk-import-panel";

type Props = {
  isEmpty: boolean;
  children: React.ReactNode;
};

/**
 * Client shell around Asset Builder content — toggles Bulk Import without a new route.
 */
export function AssetBuilderClient({ isEmpty, children }: Props) {
  const [showBulkImport, setShowBulkImport] = useState(false);

  return (
    <div className="space-y-4" data-testid="asset-builder-shell">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="asset-bulk-import-open"
          onClick={() => setShowBulkImport(true)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <Upload className="h-4 w-4" />
          Bulk Import
        </button>
        {isEmpty ? (
          <button
            type="button"
            data-testid="asset-bulk-import-empty"
            onClick={() => setShowBulkImport(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Import assets
          </button>
        ) : null}
      </div>

      {showBulkImport ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4" data-testid="asset-bulk-import-panel">
          <AssetBulkImportPanel onClose={() => setShowBulkImport(false)} />
        </div>
      ) : null}

      {isEmpty && !showBulkImport ? (
        <div
          className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-8 text-center"
          data-testid="asset-builder-empty"
        >
          <p className="text-sm font-medium text-zinc-800">No assets yet</p>
          <p className="mt-1 text-sm text-zinc-600">
            Add an asset individually below, or import a CSV inventory matched to your facility structure.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <a
              href="#asset-builder-add"
              className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Add an asset
            </a>
            <button
              type="button"
              onClick={() => setShowBulkImport(true)}
              className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Import assets
            </button>
          </div>
        </div>
      ) : null}

      {children}
    </div>
  );
}

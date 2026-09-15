"use client";

import { useState } from "react";
import { Plus, Upload } from "lucide-react";

import { AssetBulkImportPanel } from "./asset-bulk-import-panel";

type Props = {
  isEmpty: boolean;
  /** Add Asset form — shown when Add is open. */
  addForm: React.ReactNode;
  /** Registry list (and any panels that belong under the toolbar). */
  children: React.ReactNode;
};

/**
 * Asset Builder shell — compact Add / Import stay top-left above the registry.
 */
export function AssetBuilderClient({ isEmpty, addForm, children }: Props) {
  const [showAdd, setShowAdd] = useState(isEmpty);
  const [showBulkImport, setShowBulkImport] = useState(false);

  return (
    <div className="space-y-3" data-testid="asset-builder-shell">
      <div className="flex flex-wrap items-center gap-2" data-testid="asset-builder-toolbar">
        <button
          type="button"
          data-testid="asset-builder-add-open"
          aria-expanded={showAdd}
          aria-controls="asset-builder-add"
          onClick={() => {
            setShowBulkImport(false);
            setShowAdd((open) => !open);
          }}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add asset
        </button>
        <button
          type="button"
          data-testid="asset-bulk-import-open"
          aria-expanded={showBulkImport}
          onClick={() => {
            setShowAdd(false);
            setShowBulkImport((open) => !open);
          }}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          Import
        </button>
      </div>

      {showBulkImport ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4" data-testid="asset-bulk-import-panel">
          <AssetBulkImportPanel onClose={() => setShowBulkImport(false)} />
        </div>
      ) : null}

      {showAdd ? addForm : null}

      {children}
    </div>
  );
}

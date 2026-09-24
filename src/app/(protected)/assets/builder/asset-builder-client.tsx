"use client";

import { useState, type ReactNode } from "react";
import { Plus, Upload } from "lucide-react";

import { BuildPageHeader } from "@/components/build/build-breadcrumb";
import { EmptyState } from "@/components/design-system";
import { GuardedModal } from "@/components/guarded-modal";

import { AssetBulkImportPanel } from "./asset-bulk-import-panel";

type Props = {
  isEmpty: boolean;
  addForm: ReactNode;
  children: ReactNode;
};

export function AssetBuilderClient({ isEmpty, addForm, children }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [addDirty, setAddDirty] = useState(false);

  function openAdd() {
    setShowBulkImport(false);
    setAddDirty(false);
    setShowAdd(true);
  }

  function closeAdd() {
    setShowAdd(false);
    setAddDirty(false);
  }

  return (
    <div className="space-y-3" data-testid="asset-builder-shell">
      <BuildPageHeader
        title="Asset Builder"
        actions={
          <div className="flex flex-wrap items-center gap-2" data-testid="asset-builder-toolbar">
            <button
              type="button"
              data-testid="asset-builder-add-open"
              aria-expanded={showAdd}
              aria-controls="asset-builder-add"
              onClick={openAdd}
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
        }
      />

      {showBulkImport ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4" data-testid="asset-bulk-import-panel">
          <AssetBulkImportPanel onClose={() => setShowBulkImport(false)} />
        </div>
      ) : null}

      {isEmpty ? (
        <EmptyState
          icon="assets"
          title="No equipment registered"
          description="This list will show each asset with its photo and details once the first one is registered."
          action={
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700"
              data-testid="asset-builder-empty-add"
            >
              Register equipment
            </button>
          }
        />
      ) : null}

      {children}

      <GuardedModal
        open={showAdd}
        title="Add asset"
        dirty={addDirty}
        onClose={closeAdd}
        data-testid="asset-builder-add-modal"
      >
        <div
          onInput={() => setAddDirty(true)}
          onChange={() => setAddDirty(true)}
        >
          {addForm}
        </div>
      </GuardedModal>
    </div>
  );
}

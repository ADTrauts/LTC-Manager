"use client";

import { GuardedModal } from "@/components/guarded-modal";
import { SetupImportWorkspace } from "@/components/setup-import-workspace";

type Props = {
  onClose?: () => void;
  importWorkspace: {
    facilityId: string;
    actorKey: string;
    departments: Array<{ id: string; key: string; name: string }>;
  };
};

export function AssetBulkImportPanel({ onClose, importWorkspace }: Props) {
  return (
    <GuardedModal
      open
      title="Import equipment"
      dirty={false}
      onClose={() => onClose?.()}
      size="xl"
      closeLabel="Close"
      data-testid="asset-bulk-import-panel"
    >
      <SetupImportWorkspace
        facilityId={importWorkspace.facilityId}
        actorKey={importWorkspace.actorKey}
        datasets={["assets"]}
        initialDataset="assets"
        departments={importWorkspace.departments}
        embedded
      />
    </GuardedModal>
  );
}

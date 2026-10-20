"use client";
import Link from "next/link";
export function AssetBulkImportPanel({ onClose }: { onClose?: () => void }) {
  return <section className="space-y-3" data-testid="asset-bulk-import-panel">
    <h2 className="text-lg font-semibold">Reviewed Asset CSV import</h2>
    <p>Use the shared preview, confirmation and durable results workspace. Responsibility, licensing, location and identity dependencies are checked before confirmation. Existing canonical Asset authority still applies.</p>
    <Link className="app-button inline-block underline" href="/employees/bulk-setup?dataset=assets">Open reviewed Asset CSV import</Link>
    {onClose ? <button type="button" className="app-button" onClick={onClose}>Close</button> : null}
  </section>;
}

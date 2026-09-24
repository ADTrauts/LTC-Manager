import Link from "next/link";

import { createHarborCatalogAction } from "@/app/console/(staff)/catalog/actions";
import { HarborCatalogEditor } from "@/components/harbor-console/harbor-catalog-editor";
import { requireHarborStaff } from "@/lib/harbor-console/auth";

export default async function HarborCatalogNewPage() {
  await requireHarborStaff();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          Catalog
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">New catalog log</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Starts as a draft. Publish when facilities should be able to attach it.
        </p>
      </header>
      <HarborCatalogEditor mode="create" primaryAction={createHarborCatalogAction} />
      <Link href="/console/catalog" className="text-sm text-[var(--text-secondary)] hover:underline">
        Back to Catalog
      </Link>
    </div>
  );
}

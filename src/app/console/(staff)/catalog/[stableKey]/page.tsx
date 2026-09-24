import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteHarborCatalogDraftForm,
  saveAndPublishHarborCatalogAction,
  saveHarborCatalogDraftAction,
  successorHarborCatalogForm,
  retireHarborCatalogForm,
} from "@/app/console/(staff)/catalog/actions";
import { HarborCatalogEditor } from "@/components/harbor-console/harbor-catalog-editor";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { loadHarborCatalogDetail } from "@/lib/harbor-console/catalog";
import { prisma } from "@/lib/prisma";

export default async function HarborCatalogDetailPage({
  params,
}: {
  params: Promise<{ stableKey: string }>;
}) {
  await requireHarborStaff();
  const { stableKey } = await params;
  const detail = await loadHarborCatalogDetail(prisma, stableKey);
  if (!detail) notFound();

  const published = detail.published;
  const draft = detail.draft;
  const successorSource = published ?? detail.versions.find((row) => row.status === "RETIRED");

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          Catalog
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{detail.name}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {detail.statusLabel} · {stableKey}
        </p>
      </header>

      {draft ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Draft v{draft.version}</h2>
          <HarborCatalogEditor
            mode="draft"
            stableKey={stableKey}
            definitionId={draft.id}
            initialName={draft.name}
            initialDescription={draft.description}
            initialInstructions={draft.instructions}
            initialPurposeType={draft.purposeType}
            initialCategory={draft.category}
            initialCadence={draft.recommendedCadence}
            initialFields={draft.fields}
            primaryAction={saveHarborCatalogDraftAction}
            secondaryAction={saveAndPublishHarborCatalogAction}
          />
          <form action={deleteHarborCatalogDraftForm}>
            <input type="hidden" name="definitionId" value={draft.id} />
            <input type="hidden" name="stableKey" value={stableKey} />
            <button type="submit" className="text-xs text-[var(--text-secondary)] hover:underline">
              Delete draft
            </button>
          </form>
        </section>
      ) : null}

      {published ? (
        <section className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Published v{published.version}</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {published.categoryLabel} · {published.purposeLabel} · {published.cadenceLabel}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {draft ? null : (
                <form action={successorHarborCatalogForm}>
                  <input type="hidden" name="definitionId" value={published.id} />
                  <input type="hidden" name="stableKey" value={stableKey} />
                  <button
                    type="submit"
                    className="rounded-md border border-[var(--border-strong)] bg-white px-3 py-1.5 text-xs font-semibold"
                  >
                    New version
                  </button>
                </form>
              )}
              <form action={retireHarborCatalogForm}>
                <input type="hidden" name="definitionId" value={published.id} />
                <input type="hidden" name="stableKey" value={stableKey} />
                <button
                  type="submit"
                  className="rounded-md border border-[var(--border-strong)] bg-white px-3 py-1.5 text-xs font-semibold"
                >
                  Retire
                </button>
              </form>
            </div>
          </div>
          {published.description ? (
            <p className="text-sm">{published.description}</p>
          ) : null}
          <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
            {published.fields.map((field) => (
              <li key={field.id} className="px-3 py-2 text-sm">
                <p className="font-medium">{field.label}</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {field.unitLabel
                    ? `${field.fieldType} · ${field.unitLabel}`
                    : field.fieldType}
                  {field.minNumber != null || field.maxNumber != null
                    ? ` · ${field.minNumber ?? "—"}–${field.maxNumber ?? "—"}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!draft && !published && successorSource ? (
        <form action={successorHarborCatalogForm}>
          <input type="hidden" name="definitionId" value={successorSource.id} />
          <input type="hidden" name="stableKey" value={stableKey} />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)]"
          >
            New version from retired
          </button>
        </form>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold">Versions</h2>
        <ul className="mt-2 text-sm text-[var(--text-secondary)]">
          {detail.versions.map((row) => (
            <li key={row.id}>
              v{row.version} · {row.statusLabel}
            </li>
          ))}
        </ul>
      </section>

      <Link href="/console/catalog" className="text-sm text-[var(--text-secondary)] hover:underline">
        Back to Catalog
      </Link>
    </div>
  );
}

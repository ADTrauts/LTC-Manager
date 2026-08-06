"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createEvidencePresetDraftAction,
  publishEvidenceTemplateAction,
  retireEvidenceTemplateAction,
} from "@/app/(protected)/staffing/templates/actions";

type TemplateRow = {
  id: string;
  name: string;
  purposeType: string;
  status: string;
  version: number;
  stableKey: string;
  presetKey: string | null;
  _count: { fields: number; applicabilities: number; schedules: number };
};

type Props = {
  facilityId: string;
  departmentId: string;
  canManage: boolean;
  canPublish: boolean;
  templates: TemplateRow[];
  presets: Array<{
    presetKey: string;
    name: string;
    purposeType: string;
    description: string;
  }>;
  assets: Array<{
    id: string;
    name: string;
    assetCode: string;
    equipmentType: string;
    unitId: string;
  }>;
  cycleOptions: Array<{ stableKey: string; label: string; version: number }>;
};

export function OperationalTemplateBuilderPanel({
  facilityId,
  departmentId,
  canManage,
  canPublish,
  templates,
  presets,
  assets,
  cycleOptions,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const drafts = templates.filter((t) => t.status === "DRAFT");
  const published = templates.filter((t) => t.status === "PUBLISHED");
  const retired = templates.filter((t) => t.status === "RETIRED");

  function run(action: () => Promise<unknown>, okMessage: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        setMessage(okMessage);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  return (
    <div className="space-y-6" data-testid="operational-template-builder-panel">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}

      {canManage ? (
        <section className="rounded-md border border-zinc-200 bg-white p-4" data-testid="template-preset-create">
          <h2 className="text-sm font-semibold text-zinc-900">Create draft from preset</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Presets are editable drafts and are never auto-published.
          </p>
          <ul className="mt-3 space-y-2">
            {presets.map((preset) => (
              <li
                key={preset.presetKey}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-100 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">{preset.name}</p>
                  <p className="text-xs text-zinc-500">
                    {preset.purposeType} — {preset.description}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid={`create-preset-${preset.presetKey}`}
                  disabled={pending}
                  className="rounded-md border border-zinc-300 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  onClick={() =>
                    run(
                      () =>
                        createEvidencePresetDraftAction({
                          facilityId,
                          departmentId,
                          presetKey: preset.presetKey,
                        }),
                      `Created draft: ${preset.name}`,
                    )
                  }
                >
                  Create draft
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TemplateList
        title="Drafts"
        empty="No draft templates."
        rows={drafts}
        canPublish={canPublish}
        pending={pending}
        onPublish={(templateId) =>
          run(
            () => publishEvidenceTemplateAction({ facilityId, departmentId, templateId }),
            "Template published.",
          )
        }
        testId="template-drafts"
      />
      <TemplateList
        title="Published"
        empty="No published templates."
        rows={published}
        canPublish={canPublish}
        pending={pending}
        onRetire={(templateId) =>
          run(
            () => retireEvidenceTemplateAction({ facilityId, departmentId, templateId }),
            "Template retired. Historical records remain.",
          )
        }
        testId="template-published"
      />
      <TemplateList
        title="Retired"
        empty="No retired templates."
        rows={retired}
        canPublish={false}
        pending={pending}
        testId="template-retired"
      />

      <section className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
        <p>
          Assets available for applicability ({assets.length}). Published cycle keys:{" "}
          {cycleOptions.length
            ? cycleOptions.map((c) => c.stableKey).join(", ")
            : "none yet — publish cycles first."}
        </p>
        <p className="mt-1">
          After creating a Cooler Temperature draft, attach a refrigerator Asset and set schedule
          cycle keys to match published Department cycles, then publish.
        </p>
      </section>
    </div>
  );
}

function TemplateList(props: {
  title: string;
  empty: string;
  rows: TemplateRow[];
  canPublish: boolean;
  pending: boolean;
  onPublish?: (id: string) => void;
  onRetire?: (id: string) => void;
  testId: string;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4" data-testid={props.testId}>
      <h2 className="text-sm font-semibold text-zinc-900">{props.title}</h2>
      {props.rows.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">{props.empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100">
          {props.rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
              data-testid={`template-row-${row.id}`}
              data-template-status={row.status}
              data-template-name={row.name}
            >
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {row.name}{" "}
                  <span className="text-xs font-normal text-zinc-500">
                    v{row.version} · {row.purposeType} · {row.status}
                  </span>
                </p>
                <p className="text-xs text-zinc-500">
                  {row._count.fields} fields · {row._count.applicabilities} applicability ·{" "}
                  {row._count.schedules} schedules
                </p>
              </div>
              <div className="flex gap-2">
                {row.status === "DRAFT" && props.canPublish && props.onPublish ? (
                  <button
                    type="button"
                    data-testid={`publish-template-${row.id}`}
                    disabled={props.pending}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-900 disabled:opacity-50"
                    onClick={() => props.onPublish?.(row.id)}
                  >
                    Publish
                  </button>
                ) : null}
                {row.status === "PUBLISHED" && props.canPublish && props.onRetire ? (
                  <button
                    type="button"
                    data-testid={`retire-template-${row.id}`}
                    disabled={props.pending}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-900 disabled:opacity-50"
                    onClick={() => props.onRetire?.(row.id)}
                  >
                    Retire
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

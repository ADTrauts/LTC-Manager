/**
 * Wave 16A — generic Tool Host.
 *
 * Embeds tool surfaces inside Experiences. No navigation to module pages.
 * Wave 16A hosts placeholder chrome per tool kind — real tool UIs later.
 */

import type { ExperienceShellToolHost } from "@/lib/experience-shell";
import { getExperienceTool } from "@/lib/experiences";

import { UnknownComponentPlaceholder } from "./placeholders";

const SUPPORTED_TOOLS = new Set([
  "LOGS",
  "KNOWLEDGE",
  "FORMS",
  "TASKS",
  "RECORDS",
]);

export function ToolHost({ tool }: { tool: ExperienceShellToolHost }) {
  if (!SUPPORTED_TOOLS.has(tool.toolKind)) {
    return (
      <UnknownComponentPlaceholder kind={`tool:${tool.toolKind}`} />
    );
  }

  const meta = getExperienceTool(tool.toolKind);

  return (
    <div
      className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
      data-testid="experience-tool-host"
      data-tool-kind={tool.toolKind}
      data-binding-slot={tool.bindingSlot}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
            Tool Host
          </p>
          <p className="text-sm font-semibold text-zinc-900">
            {meta?.name ?? tool.toolKind}
          </p>
        </div>
        <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
          {tool.toolKind}
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-600">
        {meta?.description ??
          "Embedded tool surface. Capture and list UIs attach in a later wave."}
      </p>
      <p className="mt-1 font-mono text-[10px] text-zinc-400">
        binding:{tool.bindingSlot}
      </p>
    </div>
  );
}

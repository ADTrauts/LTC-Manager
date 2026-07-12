import type { KnowledgeArticleCategory, KnowledgeArticleStatus } from "@prisma/client";

import { AppCard } from "@/components/design-system";
import { renderKnowledgeBodyPlainText } from "@/lib/knowledge/body";
import {
  knowledgeCategoryLabel,
  knowledgeStatusLabel,
  KNOWLEDGE_SOURCE_LABEL,
} from "@/lib/knowledge/labels";

type KnowledgeArticlePreviewProps = {
  title: string;
  summary: string | null;
  body: string;
  status: KnowledgeArticleStatus;
  category: KnowledgeArticleCategory;
  sourceType: keyof typeof KNOWLEDGE_SOURCE_LABEL;
  departmentName: string | null;
  linkSummary: string[];
};

export function KnowledgeArticlePreview({
  title,
  summary,
  body,
  status,
  category,
  sourceType,
  departmentName,
  linkSummary,
}: KnowledgeArticlePreviewProps) {
  return (
    <AppCard title="Preview" subtitle="How this article will read when published">
      <div className="space-y-3 text-sm" data-testid="knowledge-article-preview">
        <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
          <span>{knowledgeStatusLabel(status)}</span>
          <span>·</span>
          <span>{knowledgeCategoryLabel(category)}</span>
          <span>·</span>
          <span>{KNOWLEDGE_SOURCE_LABEL[sourceType]}</span>
          <span>·</span>
          <span>{departmentName ?? "Facility-wide"}</span>
        </div>
        <h3 className="text-xl font-semibold text-zinc-900">{title}</h3>
        {summary ? <p className="text-zinc-600">{summary}</p> : null}
        <div
          className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-sm text-zinc-800"
          dangerouslySetInnerHTML={{ __html: renderKnowledgeBodyPlainText(body) }}
        />
        {linkSummary.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Linked operational objects
            </p>
            <ul className="mt-1 list-disc pl-5 text-zinc-700">
              {linkSummary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </AppCard>
  );
}

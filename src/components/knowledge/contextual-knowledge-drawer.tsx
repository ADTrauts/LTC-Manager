"use client";

import { useState } from "react";

import { Drawer } from "@/components/drawer";
import { EmptyState } from "@/components/design-system";
import { KnowledgeCategoryBadge } from "@/components/knowledge/knowledge-category-badge";
import { renderKnowledgeBodyPlainText } from "@/lib/knowledge/body";
import type { ContextualKnowledgeArticleClient } from "@/lib/knowledge/contextual";

type ContextualKnowledgeDrawerProps = {
  articles: ContextualKnowledgeArticleClient[];
  /** Button / trigger label. */
  triggerLabel?: string;
  /** Drawer title when open. */
  title?: string;
  /** Optional compact placement class for the trigger. */
  className?: string;
  /** Hide entirely when empty (default true). */
  hideWhenEmpty?: boolean;
};

/**
 * Frontline Help & instructions drawer. Renders nothing when empty (default).
 */
export function ContextualKnowledgeDrawer({
  articles,
  triggerLabel = "Help & instructions",
  title = "Help & instructions",
  className = "",
  hideWhenEmpty = true,
}: ContextualKnowledgeDrawerProps) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  if (articles.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <EmptyState
        inset
        icon="logs"
        title="No guidance for this work yet"
        description="Published operational knowledge will appear here when linked."
      />
    );
  }

  const active = articles.find((article) => article.id === activeId) ?? null;

  return (
    <div className={className} data-testid="contextual-knowledge">
      <button
        type="button"
        onClick={() => {
          setActiveId(null);
          setOpen(true);
        }}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-50 sm:w-auto"
      >
        <span>{triggerLabel}</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
          {articles.length}
        </span>
      </button>

      <Drawer
        open={open}
        onClose={() => {
          setOpen(false);
          setActiveId(null);
        }}
        title={active ? active.title : title}
      >
        {active ? (
          <div className="space-y-4" data-testid="contextual-knowledge-reader">
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800"
            >
              ← All guidance
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <KnowledgeCategoryBadge category={active.category} />
              <span className="text-xs text-zinc-500">{active.linkReasonLabel}</span>
            </div>
            {active.summary ? (
              <p className="text-sm text-zinc-600">{active.summary}</p>
            ) : null}
            <div
              className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-900"
              dangerouslySetInnerHTML={{ __html: renderKnowledgeBodyPlainText(active.body) }}
            />
          </div>
        ) : (
          <ul className="space-y-2" data-testid="contextual-knowledge-list">
            {articles.map((article) => (
              <li key={article.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(article.id)}
                  className="flex w-full min-h-14 flex-col items-start gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-3 text-left touch-manipulation hover:bg-zinc-50"
                >
                  <div className="flex w-full flex-wrap items-center gap-2">
                    <span className="font-semibold text-zinc-900">{article.title}</span>
                    <KnowledgeCategoryBadge category={article.category} />
                  </div>
                  <span className="text-xs text-zinc-500">{article.linkReasonLabel}</span>
                  {article.summary ? (
                    <span className="line-clamp-2 text-sm text-zinc-600">{article.summary}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </div>
  );
}

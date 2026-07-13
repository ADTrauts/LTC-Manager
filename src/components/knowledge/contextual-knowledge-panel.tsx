import { ContextualKnowledgeDrawer } from "@/components/knowledge/contextual-knowledge-drawer";
import type {
  ContextualKnowledgeArticle,
  ContextualKnowledgeArticleClient,
} from "@/lib/knowledge/contextual";
import { toContextualKnowledgeClientArticles } from "@/lib/knowledge/contextual";

type ContextualKnowledgePanelProps = {
  articles: ContextualKnowledgeArticle[] | ContextualKnowledgeArticleClient[];
  /** Compact inline strip used near forms (logs/inspections). */
  variant?: "trigger" | "compact";
  title?: string;
  className?: string;
};

function asClientArticles(
  articles: ContextualKnowledgeArticle[] | ContextualKnowledgeArticleClient[],
): ContextualKnowledgeArticleClient[] {
  if (articles.length === 0) return [];
  const first = articles[0]!;
  if (typeof first.updatedAt === "string") {
    return articles as ContextualKnowledgeArticleClient[];
  }
  return toContextualKnowledgeClientArticles(articles as ContextualKnowledgeArticle[]);
}

/**
 * Server-friendly wrapper around the Help drawer.
 * Hides completely when there are no published articles.
 */
export function ContextualKnowledgePanel({
  articles,
  variant = "trigger",
  title = "Help & instructions",
  className = "",
}: ContextualKnowledgePanelProps) {
  const clientArticles = asClientArticles(articles);
  if (clientArticles.length === 0) return null;

  if (variant === "compact") {
    return (
      <div
        className={`rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 ${className}`.trim()}
        data-testid="contextual-knowledge-compact"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-zinc-900">{title}</p>
            <p className="text-xs text-zinc-600">
              {clientArticles.length} guide{clientArticles.length === 1 ? "" : "s"} for this work
            </p>
          </div>
          <ContextualKnowledgeDrawer
            articles={clientArticles}
            triggerLabel="Open"
            title={title}
          />
        </div>
        {clientArticles[0] ? (
          <p className="mt-2 text-sm text-zinc-700">
            <span className="font-medium">{clientArticles[0].title}</span>
            {clientArticles[0].summary ? ` — ${clientArticles[0].summary}` : null}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <ContextualKnowledgeDrawer
      articles={clientArticles}
      triggerLabel={title}
      title={title}
      className={className}
    />
  );
}

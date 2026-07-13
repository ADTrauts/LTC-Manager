"use client";

import { ContextualKnowledgeDrawer } from "@/components/knowledge/contextual-knowledge-drawer";
import type { ContextualKnowledgeArticleClient } from "@/lib/knowledge/contextual";

type AssetKnowledgeTriggerProps = {
  articles: ContextualKnowledgeArticleClient[];
  assetLabel: string;
};

/** Compact help trigger for asset registry rows — hidden when empty. */
export function AssetKnowledgeTrigger({ articles, assetLabel }: AssetKnowledgeTriggerProps) {
  if (articles.length === 0) return null;
  return (
    <ContextualKnowledgeDrawer
      articles={articles}
      triggerLabel="Help"
      title={`${assetLabel} · guidance`}
    />
  );
}

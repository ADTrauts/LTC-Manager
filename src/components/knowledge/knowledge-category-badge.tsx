import type { KnowledgeArticleCategory } from "@prisma/client";

import { StatusBadge } from "@/components/design-system";
import { knowledgeCategoryLabel } from "@/lib/knowledge/labels";
import type { StatusBadgeVariant } from "@/lib/design-system/status-styles";

function categoryVariant(category: KnowledgeArticleCategory): StatusBadgeVariant {
  switch (category) {
    case "SAFETY":
      return "blocked";
    case "COMPLIANCE":
      return "warning";
    case "TROUBLESHOOTING":
      return "in_progress";
    case "SOP":
      return "success";
    default:
      return "neutral";
  }
}

type KnowledgeCategoryBadgeProps = {
  category: KnowledgeArticleCategory;
  className?: string;
};

export function KnowledgeCategoryBadge({ category, className = "" }: KnowledgeCategoryBadgeProps) {
  return (
    <StatusBadge variant={categoryVariant(category)} className={className}>
      {knowledgeCategoryLabel(category)}
    </StatusBadge>
  );
}

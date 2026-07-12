import type {
  KnowledgeArticleCategory,
  KnowledgeArticleStatus,
  KnowledgeSourceType,
} from "@prisma/client";

import type { StatusBadgeVariant } from "@/lib/design-system/status-styles";

export const KNOWLEDGE_STATUS_LABEL: Record<KnowledgeArticleStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const KNOWLEDGE_CATEGORY_LABEL: Record<KnowledgeArticleCategory, string> = {
  SOP: "SOP",
  EQUIPMENT: "Equipment",
  LOCATION: "Location",
  SAFETY: "Safety",
  COMPLIANCE: "Compliance",
  TROUBLESHOOTING: "Troubleshooting",
  TRAINING: "Training",
  REFERENCE: "Reference",
  OTHER: "Other",
};

export const KNOWLEDGE_SOURCE_LABEL: Record<KnowledgeSourceType, string> = {
  MANUAL: "Manual entry",
  HANDBOOK: "Handbook",
  VENDOR: "Vendor",
  POLICY: "Policy",
  INCIDENT_LESSON: "Incident lesson",
  OTHER: "Other",
};

export function knowledgeStatusBadgeVariant(
  status: KnowledgeArticleStatus,
): StatusBadgeVariant {
  switch (status) {
    case "PUBLISHED":
      return "success";
    case "ARCHIVED":
      return "neutral";
    case "DRAFT":
    default:
      return "warning";
  }
}

export function knowledgeCategoryLabel(category: KnowledgeArticleCategory): string {
  return KNOWLEDGE_CATEGORY_LABEL[category] ?? category;
}

export function knowledgeStatusLabel(status: KnowledgeArticleStatus): string {
  return KNOWLEDGE_STATUS_LABEL[status] ?? status;
}

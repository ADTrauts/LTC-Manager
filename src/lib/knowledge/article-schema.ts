import {
  KnowledgeArticleCategory,
  KnowledgeArticleStatus,
  KnowledgeSourceType,
} from "@prisma/client";
import { z } from "zod";

export const knowledgeArticleFormSchema = z.object({
  articleId: z.string().cuid().optional(),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(500).optional().nullable(),
  body: z.string().trim().min(1).max(50_000),
  category: z.nativeEnum(KnowledgeArticleCategory),
  sourceType: z.nativeEnum(KnowledgeSourceType).default(KnowledgeSourceType.MANUAL),
  departmentId: z.string().cuid().optional().nullable(),
  status: z.nativeEnum(KnowledgeArticleStatus).optional(),
  unitIds: z.array(z.string().cuid()).max(50).default([]),
  assetIds: z.array(z.string().cuid()).max(50).default([]),
  logTemplateIds: z.array(z.string().cuid()).max(50).default([]),
  inspectionDefinitionIds: z.array(z.string().cuid()).max(50).default([]),
});

export type KnowledgeArticleFormInput = z.infer<typeof knowledgeArticleFormSchema>;

export function parseIdListJson(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

export function validatePublishableArticle(input: {
  title: string;
  body: string;
}): { ok: true } | { ok: false; message: string } {
  if (!input.title.trim()) {
    return { ok: false, message: "Title is required to publish." };
  }
  if (!input.body.trim()) {
    return { ok: false, message: "Body is required to publish." };
  }
  return { ok: true };
}

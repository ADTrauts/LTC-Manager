import { z } from "zod";

import { AiInvalidResponseError } from "@/lib/ai/errors";
import { isAllowedAppSourcePath } from "@/lib/ai/operational-snapshot/source-paths";
import type { MorningBriefPriority, MorningBriefResult, MorningBriefUrgency } from "@/lib/ai/types";

const urgencySchema = z.enum(["attention", "in_progress", "monitor"]);

const prioritySchema = z.object({
  title: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(280),
  sourcePath: z.string().trim().min(1).max(200),
  urgency: urgencySchema,
});

const briefSchema = z.object({
  headline: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(600),
  priorities: z.array(prioritySchema).max(6).default([]),
  watchItems: z.array(z.string().trim().min(1).max(160)).max(6).default([]),
  generatedAt: z.string().trim().min(1).optional(),
});

function countSentences(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function trimSummary(summary: string): string {
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 3) return summary.trim();
  return sentences.slice(0, 3).join(" ");
}

export function validateMorningBriefResponse(
  payload: unknown,
  allowedSourcePaths: readonly string[],
  generatedAtFallback: string,
): MorningBriefResult {
  const parsed = briefSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AiInvalidResponseError("Morning Brief schema validation failed.", parsed.error);
  }

  const allowed = new Set(allowedSourcePaths);
  const priorities: MorningBriefPriority[] = [];
  for (const item of parsed.data.priorities) {
    if (!isAllowedAppSourcePath(item.sourcePath, allowed)) continue;
    if (!urgencySchema.safeParse(item.urgency).success) continue;
    priorities.push({
      title: item.title,
      reason: item.reason,
      sourcePath: item.sourcePath,
      urgency: item.urgency as MorningBriefUrgency,
    });
    if (priorities.length >= 3) break;
  }

  const watchItems = parsed.data.watchItems.slice(0, 3);
  const summary = trimSummary(parsed.data.summary);
  if (countSentences(summary) > 3) {
    throw new AiInvalidResponseError("Morning Brief summary exceeds three sentences.");
  }

  return {
    headline: parsed.data.headline,
    summary,
    priorities,
    watchItems,
    generatedAt: parsed.data.generatedAt ?? generatedAtFallback,
  };
}

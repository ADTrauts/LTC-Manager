import { z } from "zod";

import { AiInvalidResponseError } from "@/lib/ai/errors";
import { isAllowedAppSourcePath } from "@/lib/ai/operational-snapshot/source-paths";

import type { RecoveryAssistantResult, RecoveryConfidence } from "./types";

const confidenceSchema = z.enum(["supported", "conditional"]);

const resultSchema = z.object({
  headline: z.string().trim().min(1).max(160),
  situation: z.string().trim().min(1).max(600),
  checkFirst: z
    .array(
      z.object({
        action: z.string().trim().min(1).max(160),
        reason: z.string().trim().min(1).max(280),
        sourcePath: z.string().trim().min(1).max(220).nullable().optional(),
      }),
    )
    .max(6)
    .default([]),
  recoveryOptions: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().min(1).max(280),
        sourcePath: z.string().trim().min(1).max(220).nullable().optional(),
        confidence: confidenceSchema,
      }),
    )
    .max(6)
    .default([]),
  missingInformation: z.array(z.string().trim().min(1).max(160)).max(6).default([]),
  knowledgeUsed: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        sourcePath: z.string().trim().min(1).max(220),
      }),
    )
    .max(6)
    .default([]),
  generatedAt: z.string().trim().min(1).optional(),
});

function trimSituation(text: string): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 3) return text.trim();
  return sentences.slice(0, 3).join(" ");
}

export function validateRecoveryAssistantResponse(
  payload: unknown,
  allowedSourcePaths: readonly string[],
  knowledgeTitles: ReadonlySet<string>,
  knowledgePaths: ReadonlySet<string>,
  generatedAtFallback: string,
): RecoveryAssistantResult {
  const parsed = resultSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AiInvalidResponseError("Recovery Assistant schema validation failed.", parsed.error);
  }

  const allowed = new Set(allowedSourcePaths);

  const checkFirst = [];
  for (const item of parsed.data.checkFirst) {
    const path = item.sourcePath ?? null;
    if (path && !isAllowedAppSourcePath(path, allowed)) continue;
    checkFirst.push({ action: item.action, reason: item.reason, sourcePath: path });
    if (checkFirst.length >= 3) break;
  }

  const recoveryOptions = [];
  for (const item of parsed.data.recoveryOptions) {
    const path = item.sourcePath ?? null;
    if (path && !isAllowedAppSourcePath(path, allowed)) continue;
    if (!confidenceSchema.safeParse(item.confidence).success) continue;
    recoveryOptions.push({
      title: item.title,
      description: item.description,
      sourcePath: path,
      confidence: item.confidence as RecoveryConfidence,
    });
    if (recoveryOptions.length >= 3) break;
  }

  const knowledgeUsed = [];
  for (const item of parsed.data.knowledgeUsed) {
    if (!knowledgePaths.has(item.sourcePath) && !knowledgeTitles.has(item.title)) continue;
    if (!isAllowedAppSourcePath(item.sourcePath, allowed)) continue;
    knowledgeUsed.push({ title: item.title, sourcePath: item.sourcePath });
    if (knowledgeUsed.length >= 3) break;
  }

  return {
    headline: parsed.data.headline,
    situation: trimSituation(parsed.data.situation),
    checkFirst,
    recoveryOptions,
    missingInformation: parsed.data.missingInformation.slice(0, 3),
    knowledgeUsed,
    generatedAt: parsed.data.generatedAt ?? generatedAtFallback,
  };
}

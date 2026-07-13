import { z } from "zod";

import { AiInvalidResponseError } from "@/lib/ai/errors";
import { isAllowedAppSourcePath } from "@/lib/ai/operational-snapshot/source-paths";

import type {
  ShiftTransitionCarryForward,
  ShiftTransitionChangedItem,
  ShiftTransitionResolvedItem,
  ShiftTransitionResult,
  ShiftTransitionUrgency,
} from "./types";

const urgencySchema = z.enum(["attention", "in_progress", "monitor"]);
const directionSchema = z.enum(["new", "improved", "worsened", "unchanged"]);

const resultSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(600),
  resolved: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(200),
        sourcePath: z.string().trim().min(1).max(200).nullable().optional(),
      }),
    )
    .max(8)
    .default([]),
  carryForward: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        reason: z.string().trim().min(1).max(280),
        sourcePath: z.string().trim().min(1).max(200),
        urgency: urgencySchema,
      }),
    )
    .max(10)
    .default([]),
  changed: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(200),
        direction: directionSchema,
        sourcePath: z.string().trim().min(1).max(200).nullable().optional(),
      }),
    )
    .max(10)
    .default([]),
  generatedAt: z.string().trim().min(1).optional(),
  baselineAvailable: z.boolean(),
});

function trimSummary(summary: string): string {
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 3) return summary.trim();
  return sentences.slice(0, 3).join(" ");
}

export function validateShiftTransitionResponse(
  payload: unknown,
  allowedSourcePaths: readonly string[],
  generatedAtFallback: string,
  baselineAvailable: boolean,
): ShiftTransitionResult {
  const parsed = resultSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AiInvalidResponseError("Shift Transition schema validation failed.", parsed.error);
  }

  const allowed = new Set(allowedSourcePaths);

  const resolved: ShiftTransitionResolvedItem[] = [];
  for (const item of parsed.data.resolved) {
    const path = item.sourcePath ?? null;
    if (path && !isAllowedAppSourcePath(path, allowed)) continue;
    resolved.push({ text: item.text, sourcePath: path });
    if (resolved.length >= 3) break;
  }

  const carryForward: ShiftTransitionCarryForward[] = [];
  for (const item of parsed.data.carryForward) {
    if (!isAllowedAppSourcePath(item.sourcePath, allowed)) continue;
    carryForward.push({
      title: item.title,
      reason: item.reason,
      sourcePath: item.sourcePath,
      urgency: item.urgency as ShiftTransitionUrgency,
    });
    if (carryForward.length >= 5) break;
  }

  const changed: ShiftTransitionChangedItem[] = [];
  for (const item of parsed.data.changed) {
    const path = item.sourcePath ?? null;
    if (path && !isAllowedAppSourcePath(path, allowed)) continue;
    changed.push({
      text: item.text,
      direction: item.direction,
      sourcePath: path,
    });
    if (changed.length >= 5) break;
  }

  return {
    title: parsed.data.title,
    summary: trimSummary(parsed.data.summary),
    resolved,
    carryForward,
    changed: baselineAvailable ? changed : [],
    generatedAt: parsed.data.generatedAt ?? generatedAtFallback,
    baselineAvailable,
  };
}

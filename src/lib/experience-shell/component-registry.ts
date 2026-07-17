/**
 * Wave 16A — Component Registry (platform-owned key → renderer id).
 *
 * Projection emits descriptor keys. The Shell resolves them here.
 * Unknown keys map to a safe placeholder — never crash.
 *
 * This module is React-free. UI mounts live in `components/experience-shell`.
 */

import {
  EXPERIENCE_CARD_KINDS,
  EXPERIENCE_SECTION_KEYS,
  EXPERIENCE_TOOL_KEYS,
  EXPERIENCE_WIDGET_KINDS,
  type ExperienceCardKind,
  type ExperienceSectionKey,
  type ExperienceToolKey,
  type ExperienceWidgetKind,
} from "@/lib/experiences";

import type { ExperienceComponentKind } from "./types";

export type ExperienceRendererId =
  | "DefaultSection"
  | "DefaultCard"
  | "DefaultWidget"
  | "DefaultToolHost"
  | "ShellHeader"
  | "ShellPlaceholder"
  | "ShellLoading"
  | "ShellUnavailable"
  | "UnknownPlaceholder";

const SECTION_RENDERERS: Record<ExperienceSectionKey, ExperienceRendererId> =
  Object.fromEntries(
    EXPERIENCE_SECTION_KEYS.map((key) => [key, "DefaultSection" as const]),
  ) as Record<ExperienceSectionKey, ExperienceRendererId>;

const CARD_RENDERERS: Record<ExperienceCardKind, ExperienceRendererId> =
  Object.fromEntries(
    EXPERIENCE_CARD_KINDS.map((key) => [key, "DefaultCard" as const]),
  ) as Record<ExperienceCardKind, ExperienceRendererId>;

const WIDGET_RENDERERS: Record<ExperienceWidgetKind, ExperienceRendererId> =
  Object.fromEntries(
    EXPERIENCE_WIDGET_KINDS.map((key) => [key, "DefaultWidget" as const]),
  ) as Record<ExperienceWidgetKind, ExperienceRendererId>;

const TOOL_RENDERERS: Record<ExperienceToolKey, ExperienceRendererId> =
  Object.fromEntries(
    EXPERIENCE_TOOL_KEYS.map((key) => [key, "DefaultToolHost" as const]),
  ) as Record<ExperienceToolKey, ExperienceRendererId>;

/**
 * Resolve a component registry key to a renderer id.
 * Unknown keys → UnknownPlaceholder (safe).
 */
export function resolveComponentRenderer(
  kind: ExperienceComponentKind | string,
): ExperienceRendererId {
  if (kind === "shell:header") return "ShellHeader";
  if (kind === "shell:placeholder") return "ShellPlaceholder";
  if (kind === "shell:loading") return "ShellLoading";
  if (kind === "shell:unavailable") return "ShellUnavailable";
  if (kind === "shell:unknown") return "UnknownPlaceholder";

  if (kind.startsWith("section:")) {
    const key = kind.slice("section:".length) as ExperienceSectionKey;
    return SECTION_RENDERERS[key] ?? "UnknownPlaceholder";
  }
  if (kind.startsWith("card:")) {
    const key = kind.slice("card:".length) as ExperienceCardKind;
    return CARD_RENDERERS[key] ?? "UnknownPlaceholder";
  }
  if (kind.startsWith("widget:")) {
    const key = kind.slice("widget:".length) as ExperienceWidgetKind;
    return WIDGET_RENDERERS[key] ?? "UnknownPlaceholder";
  }
  if (kind.startsWith("tool:")) {
    const key = kind.slice("tool:".length) as ExperienceToolKey;
    return TOOL_RENDERERS[key] ?? "UnknownPlaceholder";
  }

  return "UnknownPlaceholder";
}

export function isKnownComponentKind(kind: string): boolean {
  return resolveComponentRenderer(kind) !== "UnknownPlaceholder";
}

/**
 * Register an override for a specific key (tests / future Experience widgets).
 * Platform-owned — Experiences cannot register arbitrary runtime from Admin.
 */
const overrides = new Map<string, ExperienceRendererId>();

export function registerComponentOverride(
  kind: string,
  rendererId: ExperienceRendererId,
): void {
  overrides.set(kind, rendererId);
}

export function clearComponentOverrides(): void {
  overrides.clear();
}

export function resolveComponentRendererWithOverrides(
  kind: ExperienceComponentKind | string,
): ExperienceRendererId {
  const override = overrides.get(kind);
  if (override) return override;
  return resolveComponentRenderer(kind);
}

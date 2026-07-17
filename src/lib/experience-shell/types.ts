/**
 * Wave 16A — Experience Shell model types.
 *
 * Pure descriptors resolved from Experience contracts + Projection inputs.
 * No React. No Experience-specific product logic.
 */

import type {
  ExperienceActionCategory,
  ExperienceActionPlacement,
  ExperienceCardKind,
  ExperienceDensity,
  ExperienceSectionKey,
  ExperienceToolKey,
  ExperienceWidgetKind,
} from "@/lib/experiences";

/** Live values bound to overlay slots — engines fill these; shell never mutates Projection. */
export type ExperienceRuntimeOverlay = {
  values: Readonly<Record<string, unknown>>;
  errors?: Readonly<Record<string, string>>;
};

export type ExperienceShellAction = {
  key: string;
  label: string;
  category?: ExperienceActionCategory | string;
  placement?: ExperienceActionPlacement | string;
};

export type ExperienceShellWidget = {
  key: string;
  kind: ExperienceWidgetKind;
  overlayKey?: string;
  /** Resolved overlay value when present. */
  overlayValue?: unknown;
  overlayError?: string;
  actionKeys: readonly string[];
};

export type ExperienceShellToolHost = {
  key: string;
  toolKind: ExperienceToolKey;
  bindingSlot: string;
  sectionKey: ExperienceSectionKey;
};

export type ExperienceShellCard = {
  key: string;
  kind: ExperienceCardKind;
  title: string;
  description?: string;
  sectionKey: ExperienceSectionKey;
  widgets: readonly ExperienceShellWidget[];
  toolHost: ExperienceShellToolHost | null;
  actions: readonly ExperienceShellAction[];
  overlayKeys: readonly string[];
};

export type ExperienceShellSection = {
  key: ExperienceSectionKey;
  order: number;
  required: boolean;
  cards: readonly ExperienceShellCard[];
};

export type ExperienceShellState =
  | "ready"
  | "loading"
  | "empty"
  | "unavailable";

/**
 * Fully resolved shell model ready for generic renderers.
 */
export type ExperienceShellModel = {
  experienceKey: string;
  label: string;
  description: string;
  density: ExperienceDensity;
  statusKeys: readonly string[];
  headerActions: readonly ExperienceShellAction[];
  sections: readonly ExperienceShellSection[];
  state: ExperienceShellState;
  unavailableReason: string | null;
  /** True when body is placeholder until Experience-specific widgets ship. */
  bodyIsPlaceholder: boolean;
};

/**
 * Inputs from Projection adapters / homes — not Experience-specific.
 */
export type ResolveExperienceShellInput = {
  experienceKey: string;
  label: string;
  description?: string;
  density?: ExperienceDensity | string;
  allowedActionKeys?: readonly string[];
  actions?: readonly ExperienceShellAction[];
  statusKeys?: readonly string[];
  /** Home purpose adaptation — defaults to unit workspace contribution. */
  home?: "unitWorkspace" | "workspace" | "operationsCenter" | "businessWorkspace";
  overlay?: ExperienceRuntimeOverlay | null;
  state?: Exclude<ExperienceShellState, "empty" | "unavailable">;
};

/** Stable registry keys for component lookup. */
export type ExperienceComponentKind =
  | `section:${ExperienceSectionKey}`
  | `card:${ExperienceCardKind}`
  | `widget:${ExperienceWidgetKind}`
  | `tool:${ExperienceToolKey}`
  | "shell:header"
  | "shell:placeholder"
  | "shell:loading"
  | "shell:unavailable"
  | "shell:unknown";

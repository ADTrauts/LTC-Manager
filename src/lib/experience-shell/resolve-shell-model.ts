/**
 * Wave 16A — resolve Experience contracts into a renderable shell model.
 * Pure. No React. No Experience-specific branches.
 */

import {
  EXPERIENCE_DENSITIES,
  getExperience,
  type ExperienceCardDeclaration,
  type ExperienceDensity,
  type ExperienceSectionKey,
  type ExperienceToolHostDeclaration,
  type ExperienceWidgetDeclaration,
} from "@/lib/experiences";

import type {
  ExperienceRuntimeOverlay,
  ExperienceShellAction,
  ExperienceShellCard,
  ExperienceShellModel,
  ExperienceShellSection,
  ExperienceShellToolHost,
  ExperienceShellWidget,
  ResolveExperienceShellInput,
} from "./types";

function asDensity(value: string | undefined): ExperienceDensity {
  if (
    value &&
    (EXPERIENCE_DENSITIES as readonly string[]).includes(value)
  ) {
    return value as ExperienceDensity;
  }
  return "FULL";
}

function contributionSectionKeys(
  experienceKey: string,
  home: ResolveExperienceShellInput["home"],
): Set<ExperienceSectionKey> | null {
  const catalog = getExperience(experienceKey);
  if (!catalog) return null;
  const contracts = catalog.contracts;
  const contribution =
    home === "businessWorkspace"
      ? contracts.businessWorkspaceContribution
      : home === "operationsCenter"
        ? contracts.operationsCenterContribution
        : home === "workspace"
          ? contracts.workspaceContribution
          : contracts.unitWorkspaceContribution;
  return new Set(contribution.sectionKeys);
}

function mapWidget(
  declaration: ExperienceWidgetDeclaration,
  overlay: ExperienceRuntimeOverlay | null | undefined,
): ExperienceShellWidget {
  const overlayKey = declaration.overlayKey;
  return {
    key: declaration.key,
    kind: declaration.kind,
    overlayKey,
    overlayValue:
      overlayKey && overlay ? overlay.values[overlayKey] : undefined,
    overlayError:
      overlayKey && overlay?.errors ? overlay.errors[overlayKey] : undefined,
    actionKeys: declaration.actionKeys ?? [],
  };
}

function mapToolHost(
  declaration: ExperienceToolHostDeclaration | undefined,
): ExperienceShellToolHost | null {
  if (!declaration) return null;
  return {
    key: declaration.key,
    toolKind: declaration.toolKind,
    bindingSlot: declaration.bindingSlot,
    sectionKey: declaration.sectionKey,
  };
}

function mapCard(
  declaration: ExperienceCardDeclaration,
  widgetsByKey: Map<string, ExperienceWidgetDeclaration>,
  toolHostsByKey: Map<string, ExperienceToolHostDeclaration>,
  actionsByKey: Map<string, ExperienceShellAction>,
  overlay: ExperienceRuntimeOverlay | null | undefined,
): ExperienceShellCard {
  const widgets = declaration.widgetKeys
    .map((key) => widgetsByKey.get(key))
    .filter((w): w is ExperienceWidgetDeclaration => w != null)
    .map((w) => mapWidget(w, overlay));

  const actions = (declaration.actionKeys ?? [])
    .map((key) => actionsByKey.get(key))
    .filter((a): a is ExperienceShellAction => a != null);

  const toolHost = declaration.toolHostKey
    ? mapToolHost(toolHostsByKey.get(declaration.toolHostKey))
    : null;

  return {
    key: declaration.key,
    kind: declaration.kind,
    title: declaration.title,
    description: declaration.description,
    sectionKey: declaration.sectionKey,
    widgets,
    toolHost,
    actions,
    overlayKeys: declaration.overlayKeys ?? [],
  };
}

/**
 * Build a generic ExperienceShellModel from catalog contracts + home inputs.
 */
export function resolveExperienceShellModel(
  input: ResolveExperienceShellInput,
): ExperienceShellModel {
  if (input.state === "loading") {
    return {
      experienceKey: input.experienceKey,
      label: input.label,
      description: input.description ?? "",
      density: asDensity(input.density),
      statusKeys: input.statusKeys ?? [],
      headerActions: [],
      sections: [],
      state: "loading",
      unavailableReason: null,
      bodyIsPlaceholder: true,
    };
  }

  const catalog = getExperience(input.experienceKey);
  if (!catalog) {
    return {
      experienceKey: input.experienceKey,
      label: input.label,
      description: input.description ?? "",
      density: asDensity(input.density),
      statusKeys: input.statusKeys ?? [],
      headerActions: [],
      sections: [],
      state: "unavailable",
      unavailableReason: `Unknown Experience: ${input.experienceKey}`,
      bodyIsPlaceholder: true,
    };
  }

  const contracts = catalog.contracts;
  const home = input.home ?? "unitWorkspace";
  const allowedSections = contributionSectionKeys(input.experienceKey, home);
  const allowedActions = new Set(input.allowedActionKeys ?? []);

  const actionsByKey = new Map<string, ExperienceShellAction>();
  for (const action of contracts.actions) {
    if (allowedActions.size > 0 && !allowedActions.has(action.key)) continue;
    actionsByKey.set(action.key, {
      key: action.key,
      label: action.label,
      category: action.category,
      placement: action.placement,
    });
  }
  // Prefer Projection-narrowed action labels when provided.
  for (const action of input.actions ?? []) {
    if (allowedActions.size > 0 && !allowedActions.has(action.key)) continue;
    actionsByKey.set(action.key, action);
  }

  const widgetsByKey = new Map(
    contracts.widgets.map((w) => [w.key, w] as const),
  );
  const toolHostsByKey = new Map(
    contracts.toolHosts.map((t) => [t.key, t] as const),
  );
  const cardsByKey = new Map(contracts.cards.map((c) => [c.key, c] as const));

  const density = asDensity(
    input.density ??
      (home === "unitWorkspace"
        ? contracts.unitWorkspaceContribution.density
        : contracts.workspaceContribution.density),
  );

  const sections: ExperienceShellSection[] = [...contracts.sections]
    .filter((section) => {
      if (!allowedSections) return true;
      if (section.required) return allowedSections.has(section.key);
      return allowedSections.has(section.key);
    })
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    .map((section) => {
      const cards = section.cardKeys
        .map((key) => cardsByKey.get(key))
        .filter((c): c is ExperienceCardDeclaration => c != null)
        .map((card) =>
          mapCard(
            card,
            widgetsByKey,
            toolHostsByKey,
            actionsByKey,
            input.overlay,
          ),
        );
      return {
        key: section.key,
        order: section.order,
        required: section.required,
        cards,
      };
    })
    // Suppress empty optional sections (required HEADER may still be empty of cards).
    .filter((section) => section.required || section.cards.length > 0);

  const headerActions = [...actionsByKey.values()].filter(
    (action) =>
      action.placement === "HEADER" ||
      (input.actions ?? []).some(
        (a) => a.key === action.key && a.placement === "HEADER",
      ),
  );

  const hasContent =
    sections.some((s) => s.cards.length > 0) || headerActions.length > 0;

  return {
    experienceKey: catalog.key,
    label: input.label || catalog.name,
    description: input.description ?? catalog.description,
    density,
    statusKeys:
      input.statusKeys ?? contracts.statusContracts.statusKeys ?? [],
    headerActions,
    sections,
    state: hasContent ? "ready" : "empty",
    unavailableReason: null,
    // Wave 16A: no Experience-specific widgets yet — body remains placeholder chrome.
    bodyIsPlaceholder: true,
  };
}

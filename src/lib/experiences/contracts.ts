/**
 * Experience Contracts — Wave 15AC declarative composition contracts.
 *
 * Architecture: docs/experience-runtime/04, docs/experience-framework/*.
 * No React, Projection, Shell, or runtime rendering.
 */

import type { ExperienceToolKey } from "./types";

// ---------------------------------------------------------------------------
// Canonical vocabularies (registry-governed)
// ---------------------------------------------------------------------------

export const EXPERIENCE_SECTION_KEYS = [
  "HEADER",
  "OVERVIEW",
  "CURRENT_STATUS",
  "OUTSTANDING_WORK",
  "TODAYS_WORK",
  "EQUIPMENT",
  "RESOURCES",
  "TASKS",
  "LOGS",
  "FORMS",
  "KNOWLEDGE",
  "HISTORY",
  "METRICS",
  "REPORTS",
  "DOCUMENTS",
  "AI",
  "SETTINGS",
] as const;

export type ExperienceSectionKey = (typeof EXPERIENCE_SECTION_KEYS)[number];

/** Forbidden in Experience shells — kept for validation rejection tests. */
export const FORBIDDEN_SECTION_KEYS = ["NOTIFICATIONS_INBOX"] as const;

export const EXPERIENCE_CARD_KINDS = [
  "SUMMARY",
  "STATUS",
  "WORK_QUEUE",
  "RESOURCE_LIST",
  "TOOL_HOST",
  "KNOWLEDGE",
  "METRIC",
  "HISTORY",
  "AI",
  "ACTION_STRIP",
] as const;

export type ExperienceCardKind = (typeof EXPERIENCE_CARD_KINDS)[number];

export const EXPERIENCE_WIDGET_KINDS = [
  "TEXT",
  "RICH_TEXT",
  "STATUS_CHIP",
  "METRIC_VALUE",
  "LIST",
  "TABLE_ROWS",
  "PROGRESS",
  "ALERT",
  "ACTION_BUTTON",
  "FORM_FIELD_GROUP",
  "CHART_SPARK",
  "ENTITY_LINK",
  "AI_SUMMARY",
  "EMPTY_HINT",
] as const;

export type ExperienceWidgetKind = (typeof EXPERIENCE_WIDGET_KINDS)[number];

export const EXPERIENCE_DENSITIES = [
  "FULL",
  "COMPACT",
  "STATUS",
  "ACTION",
] as const;

export type ExperienceDensity = (typeof EXPERIENCE_DENSITIES)[number];

export const EXPERIENCE_ACTION_CATEGORIES = [
  "CREATE",
  "SUBMIT",
  "REVIEW",
  "APPROVE",
  "ASSIGN",
  "REPAIR",
  "INSPECT",
  "ESCALATE",
  "RESOLVE",
  "OPEN_TOOL",
  "VIEW_HISTORY",
  "DOWNLOAD",
  "AI_ASSIST",
  "NAVIGATE_RELATED",
  "CONFIGURE",
] as const;

export type ExperienceActionCategory =
  (typeof EXPERIENCE_ACTION_CATEGORIES)[number];

export const EXPERIENCE_ACTION_PLACEMENTS = [
  "HEADER",
  "CARD",
  "TOOLBAR",
  "INLINE",
  "MODAL_TRIGGER",
] as const;

export type ExperienceActionPlacement =
  (typeof EXPERIENCE_ACTION_PLACEMENTS)[number];

export const QUERY_SCOPE_GRAINS = [
  "ROOM",
  "UNIT",
  "DEPARTMENT",
  "FACILITY",
] as const;

export type QueryScopeGrain = (typeof QUERY_SCOPE_GRAINS)[number];

export const STATUS_VOCABULARY = [
  "READY",
  "IN_PROGRESS",
  "NEEDS_ATTENTION",
  "DUE",
  "OVERDUE",
  "UNKNOWN",
] as const;

export type ExperienceStatusKey = (typeof STATUS_VOCABULARY)[number];

// ---------------------------------------------------------------------------
// Contract declarations
// ---------------------------------------------------------------------------

export type ExperienceSectionDeclaration = {
  key: ExperienceSectionKey;
  order: number;
  /** When true, density adapters should not drop this section. */
  required: boolean;
  cardKeys: readonly string[];
};

export type ExperienceCardDeclaration = {
  key: string;
  sectionKey: ExperienceSectionKey;
  kind: ExperienceCardKind;
  title: string;
  description?: string;
  widgetKeys: readonly string[];
  actionKeys?: readonly string[];
  /** When kind is TOOL_HOST, references toolHosts[].key */
  toolHostKey?: string;
  overlayKeys?: readonly string[];
};

export type ExperienceWidgetDeclaration = {
  key: string;
  kind: ExperienceWidgetKind;
  overlayKey?: string;
  actionKeys?: readonly string[];
};

export type ExperienceToolHostDeclaration = {
  key: string;
  toolKind: ExperienceToolKey;
  sectionKey: ExperienceSectionKey;
  /** Stable binding slot id for profile/template attachment later. */
  bindingSlot: string;
};

export type HomeContributionContract = {
  density: ExperienceDensity;
  sectionKeys: readonly ExperienceSectionKey[];
  primaryActionKeys?: readonly string[];
  mountHandles?: readonly string[];
};

export type NavigationContributionEntry = {
  id: string;
  label: string;
  sectionKey?: ExperienceSectionKey;
};

export type ExperienceActionDeclaration = {
  key: string;
  category: ExperienceActionCategory;
  label: string;
  permissionKeys: readonly string[];
  placement: ExperienceActionPlacement;
};

export type ExperienceQueryScopeContract = {
  domains: readonly string[];
  grain: QueryScopeGrain;
  /** Declarative rule identifiers — not executable code. */
  rules: readonly string[];
};

export type ExperienceStatusContract = {
  readinessSignalKeys: readonly string[];
  statusKeys: readonly ExperienceStatusKey[];
};

export type ExperienceAvailabilityContract = {
  requiresFeatureFlags?: readonly string[];
  requiresDomains?: readonly string[];
};

/**
 * Full declarative contract surface for one Experience.
 * Projection will later emit descriptors derived from this — never React.
 */
export type ExperienceContracts = {
  configurationSchema: Readonly<Record<string, unknown>>;
  availability: ExperienceAvailabilityContract;
  sections: readonly ExperienceSectionDeclaration[];
  cards: readonly ExperienceCardDeclaration[];
  widgets: readonly ExperienceWidgetDeclaration[];
  toolHosts: readonly ExperienceToolHostDeclaration[];
  overlayKeys: readonly string[];
  /** Generic / default workspace contribution (FULL-oriented). */
  workspaceContribution: HomeContributionContract;
  unitWorkspaceContribution: HomeContributionContract;
  operationsCenterContribution: HomeContributionContract;
  businessWorkspaceContribution: HomeContributionContract;
  navigationContribution: {
    entries: readonly NavigationContributionEntry[];
  };
  permissions: {
    readKeys: readonly string[];
    actionPermissionKeys: readonly string[];
  };
  analyticsKeys: readonly string[];
  aiContextKeys: readonly string[];
  queryScope: ExperienceQueryScopeContract;
  statusContracts: ExperienceStatusContract;
  actions: readonly ExperienceActionDeclaration[];
  extensionPoints: readonly string[];
  relationships: {
    relatedExperienceKeys: readonly string[];
  };
};

// ---------------------------------------------------------------------------
// Compact builder input
// ---------------------------------------------------------------------------

export type ExperienceContractBuildOptions = {
  experienceKey: string;
  experienceName: string;
  tools: readonly ExperienceToolKey[];
  domains: readonly string[];
  grain: QueryScopeGrain;
  includeStatus?: boolean;
  includeOutstandingWork?: boolean;
  includeResources?: boolean;
  includeTasks?: boolean;
  includeHistory?: boolean;
  includeMetrics?: boolean;
  includeAi?: boolean;
  includeSettings?: boolean;
  relatedExperienceKeys?: readonly string[];
  extraActions?: readonly ExperienceActionDeclaration[];
  extraOverlayKeys?: readonly string[];
  extraAnalyticsKeys?: readonly string[];
  extraAiContextKeys?: readonly string[];
  configurationSchema?: Readonly<Record<string, unknown>>;
  availability?: ExperienceAvailabilityContract;
  /** Replace auto-built sections/cards/widgets entirely (golden Experiences). */
  compositionOverride?: {
    sections: readonly ExperienceSectionDeclaration[];
    cards: readonly ExperienceCardDeclaration[];
    widgets: readonly ExperienceWidgetDeclaration[];
    toolHosts: readonly ExperienceToolHostDeclaration[];
  };
};

function slug(experienceKey: string): string {
  return experienceKey.toLowerCase();
}

function toolSectionKey(tool: ExperienceToolKey): ExperienceSectionKey | null {
  switch (tool) {
    case "LOGS":
      return "LOGS";
    case "FORMS":
      return "FORMS";
    case "KNOWLEDGE":
      return "KNOWLEDGE";
    case "TASKS":
      return "TASKS";
    case "RECORDS":
      return "DOCUMENTS";
    default:
      return null;
  }
}

/**
 * Build a complete ExperienceContracts object from compact options.
 * Every catalog Experience must end up with a full contract via this or an override.
 */
export function buildExperienceContracts(
  options: ExperienceContractBuildOptions,
): ExperienceContracts {
  const key = options.experienceKey;
  const s = slug(key);
  const includeStatus = options.includeStatus ?? true;
  const includeOutstanding = options.includeOutstandingWork ?? true;
  const includeResources = options.includeResources ?? false;
  const includeTasks =
    options.includeTasks ?? options.tools.includes("TASKS");
  const includeHistory = options.includeHistory ?? true;
  const includeMetrics = options.includeMetrics ?? false;
  const includeAi = options.includeAi ?? false;
  const includeSettings = options.includeSettings ?? true;

  const widgets: ExperienceWidgetDeclaration[] = [
    {
      key: `${s}.overview_text`,
      kind: "TEXT",
    },
  ];
  const cards: ExperienceCardDeclaration[] = [
    {
      key: `${s}.overview_card`,
      sectionKey: "OVERVIEW",
      kind: "SUMMARY",
      title: options.experienceName,
      description: `Overview of ${options.experienceName}.`,
      widgetKeys: [`${s}.overview_text`],
    },
  ];
  const sections: ExperienceSectionDeclaration[] = [
    {
      key: "HEADER",
      order: 0,
      required: true,
      cardKeys: [],
    },
    {
      key: "OVERVIEW",
      order: 10,
      required: true,
      cardKeys: [`${s}.overview_card`],
    },
  ];

  const overlayKeys: string[] = [`${s}.overview`];
  const actions: ExperienceActionDeclaration[] = [
    {
      key: `${s}.view_history`,
      category: "VIEW_HISTORY",
      label: "View history",
      permissionKeys: [`experience.${key}.read`],
      placement: "CARD",
    },
    {
      key: `${s}.configure`,
      category: "CONFIGURE",
      label: "Settings",
      permissionKeys: [`experience.${key}.configure`],
      placement: "HEADER",
    },
  ];

  if (includeStatus) {
    widgets.push(
      {
        key: `${s}.status_chip`,
        kind: "STATUS_CHIP",
        overlayKey: `${s}.status`,
      },
      {
        key: `${s}.status_alert`,
        kind: "ALERT",
        overlayKey: `${s}.alerts`,
      },
    );
    cards.push({
      key: `${s}.status_card`,
      sectionKey: "CURRENT_STATUS",
      kind: "STATUS",
      title: "Current status",
      widgetKeys: [`${s}.status_chip`, `${s}.status_alert`],
      overlayKeys: [`${s}.status`, `${s}.alerts`],
      actionKeys: [`${s}.escalate`],
    });
    sections.push({
      key: "CURRENT_STATUS",
      order: 20,
      required: true,
      cardKeys: [`${s}.status_card`],
    });
    overlayKeys.push(`${s}.status`, `${s}.alerts`, `${s}.readiness`);
    actions.push({
      key: `${s}.escalate`,
      category: "ESCALATE",
      label: "Escalate",
      permissionKeys: [`experience.${key}.escalate`],
      placement: "CARD",
    });
  }

  if (includeOutstanding) {
    widgets.push({
      key: `${s}.outstanding_list`,
      kind: "LIST",
      overlayKey: `${s}.outstanding`,
      actionKeys: [`${s}.resolve`],
    });
    cards.push({
      key: `${s}.outstanding_card`,
      sectionKey: "OUTSTANDING_WORK",
      kind: "WORK_QUEUE",
      title: "Outstanding work",
      widgetKeys: [`${s}.outstanding_list`],
      overlayKeys: [`${s}.outstanding`],
      actionKeys: [`${s}.resolve`],
    });
    sections.push({
      key: "OUTSTANDING_WORK",
      order: 30,
      required: false,
      cardKeys: [`${s}.outstanding_card`],
    });
    overlayKeys.push(`${s}.outstanding`);
    actions.push({
      key: `${s}.resolve`,
      category: "RESOLVE",
      label: "Resolve",
      permissionKeys: [`experience.${key}.resolve`],
      placement: "INLINE",
    });
  }

  if (includeResources) {
    widgets.push({
      key: `${s}.resources_list`,
      kind: "LIST",
      overlayKey: `${s}.resources`,
    });
    cards.push({
      key: `${s}.resources_card`,
      sectionKey: "RESOURCES",
      kind: "RESOURCE_LIST",
      title: "Resources",
      widgetKeys: [`${s}.resources_list`],
      overlayKeys: [`${s}.resources`],
    });
    sections.push({
      key: "RESOURCES",
      order: 40,
      required: false,
      cardKeys: [`${s}.resources_card`],
    });
    overlayKeys.push(`${s}.resources`);
  }

  const toolHosts: ExperienceToolHostDeclaration[] = [];

  for (const tool of options.tools) {
    const sectionKey = toolSectionKey(tool);
    if (!sectionKey) continue;

    // TASKS may already be covered by outstanding; still allow tool host when TASKS present
    if (tool === "TASKS" && !includeTasks) continue;

    const hostKey = `${s}.tool_${tool.toLowerCase()}`;
    const openAction = `${s}.open_${tool.toLowerCase()}`;
    toolHosts.push({
      key: hostKey,
      toolKind: tool,
      sectionKey,
      bindingSlot: `${s}.${tool.toLowerCase()}.bindings`,
    });
    widgets.push({
      key: `${s}.tool_${tool.toLowerCase()}_body`,
      kind: tool === "FORMS" ? "FORM_FIELD_GROUP" : "LIST",
      overlayKey: `${s}.tool_${tool.toLowerCase()}`,
    });
    cards.push({
      key: `${s}.tool_${tool.toLowerCase()}_card`,
      sectionKey,
      kind: tool === "KNOWLEDGE" ? "KNOWLEDGE" : "TOOL_HOST",
      title: tool.charAt(0) + tool.slice(1).toLowerCase(),
      widgetKeys: [`${s}.tool_${tool.toLowerCase()}_body`],
      toolHostKey: hostKey,
      overlayKeys: [`${s}.tool_${tool.toLowerCase()}`],
      actionKeys: [openAction],
    });
    if (!sections.some((sec) => sec.key === sectionKey)) {
      sections.push({
        key: sectionKey,
        order:
          sectionKey === "TASKS"
            ? 45
            : sectionKey === "LOGS"
              ? 50
              : sectionKey === "FORMS"
                ? 55
                : sectionKey === "KNOWLEDGE"
                  ? 60
                  : 65,
        required: false,
        cardKeys: [`${s}.tool_${tool.toLowerCase()}_card`],
      });
    } else {
      const existing = sections.find((sec) => sec.key === sectionKey)!;
      const idx = sections.indexOf(existing);
      sections[idx] = {
        ...existing,
        cardKeys: [...existing.cardKeys, `${s}.tool_${tool.toLowerCase()}_card`],
      };
    }
    overlayKeys.push(`${s}.tool_${tool.toLowerCase()}`);
    actions.push({
      key: openAction,
      category: tool === "LOGS" || tool === "FORMS" ? "SUBMIT" : "OPEN_TOOL",
      label: `Open ${tool.charAt(0) + tool.slice(1).toLowerCase()}`,
      permissionKeys: [
        `experience.${key}.read`,
        `experience.${key}.tool.${tool}`,
      ],
      placement: "TOOLBAR",
    });
    if (tool === "LOGS" || tool === "FORMS") {
      actions.push({
        key: `${s}.submit_${tool.toLowerCase()}`,
        category: "SUBMIT",
        label: `Submit ${tool.charAt(0) + tool.slice(1).toLowerCase()}`,
        permissionKeys: [`experience.${key}.submit`],
        placement: "CARD",
      });
    }
  }

  if (includeHistory) {
    widgets.push({
      key: `${s}.history_rows`,
      kind: "TABLE_ROWS",
      overlayKey: `${s}.history`,
    });
    cards.push({
      key: `${s}.history_card`,
      sectionKey: "HISTORY",
      kind: "HISTORY",
      title: "History",
      widgetKeys: [`${s}.history_rows`],
      overlayKeys: [`${s}.history`],
      actionKeys: [`${s}.view_history`],
    });
    sections.push({
      key: "HISTORY",
      order: 80,
      required: false,
      cardKeys: [`${s}.history_card`],
    });
    overlayKeys.push(`${s}.history`);
  }

  if (includeMetrics) {
    widgets.push({
      key: `${s}.metric_value`,
      kind: "METRIC_VALUE",
      overlayKey: `${s}.metrics`,
    });
    cards.push({
      key: `${s}.metrics_card`,
      sectionKey: "METRICS",
      kind: "METRIC",
      title: "Metrics",
      widgetKeys: [`${s}.metric_value`],
      overlayKeys: [`${s}.metrics`],
    });
    sections.push({
      key: "METRICS",
      order: 85,
      required: false,
      cardKeys: [`${s}.metrics_card`],
    });
    overlayKeys.push(`${s}.metrics`);
  }

  if (includeAi) {
    widgets.push({
      key: `${s}.ai_summary`,
      kind: "AI_SUMMARY",
      overlayKey: `${s}.ai`,
    });
    cards.push({
      key: `${s}.ai_card`,
      sectionKey: "AI",
      kind: "AI",
      title: "AI assist",
      widgetKeys: [`${s}.ai_summary`],
      overlayKeys: [`${s}.ai`],
      actionKeys: [`${s}.ai_assist`],
    });
    sections.push({
      key: "AI",
      order: 70,
      required: false,
      cardKeys: [`${s}.ai_card`],
    });
    overlayKeys.push(`${s}.ai`);
    actions.push({
      key: `${s}.ai_assist`,
      category: "AI_ASSIST",
      label: "AI assist",
      permissionKeys: [`experience.${key}.ai`],
      placement: "CARD",
    });
  }

  if (includeSettings) {
    sections.push({
      key: "SETTINGS",
      order: 90,
      required: false,
      cardKeys: [],
    });
  }

  if (options.compositionOverride) {
    sections.length = 0;
    sections.push(...options.compositionOverride.sections);
    cards.length = 0;
    cards.push(...options.compositionOverride.cards);
    widgets.length = 0;
    widgets.push(...options.compositionOverride.widgets);
    toolHosts.length = 0;
    toolHosts.push(...options.compositionOverride.toolHosts);
  }

  if (options.extraActions) {
    actions.push(...options.extraActions);
  }
  if (options.extraOverlayKeys) {
    overlayKeys.push(...options.extraOverlayKeys);
  }

  const sectionKeysOrdered = [...sections]
    .sort((a, b) => a.order - b.order)
    .map((sec) => sec.key);

  const fullSections = sectionKeysOrdered;
  const compactSections = sectionKeysOrdered.filter((k) =>
    (
      [
        "HEADER",
        "OVERVIEW",
        "CURRENT_STATUS",
        "OUTSTANDING_WORK",
      ] as ExperienceSectionKey[]
    ).includes(k),
  );
  const statusSections = sectionKeysOrdered.filter((k) =>
    (["HEADER", "CURRENT_STATUS"] as ExperienceSectionKey[]).includes(k),
  );
  const actionSections = sectionKeysOrdered.filter((k) =>
    (
      ["HEADER", "OUTSTANDING_WORK", "TODAYS_WORK", "TASKS"] as ExperienceSectionKey[]
    ).includes(k),
  );

  const primaryActions = actions
    .filter((a) => a.placement === "HEADER" || a.category === "SUBMIT")
    .slice(0, 3)
    .map((a) => a.key);

  const readKeys = [`experience.${key}.read`];
  const actionPermissionKeys = [
    ...new Set(actions.flatMap((a) => a.permissionKeys)),
  ];

  const analyticsKeys = [
    `${s}.completion_rate`,
    ...(options.extraAnalyticsKeys ?? []),
  ];
  const aiContextKeys = includeAi
    ? [
        `${s}.current_state`,
        `${s}.outstanding_work`,
        `${s}.history`,
        ...(options.extraAiContextKeys ?? []),
      ]
    : [...(options.extraAiContextKeys ?? [])];

  return {
    configurationSchema: options.configurationSchema ?? {},
    availability: options.availability ?? {},
    sections: sections.sort((a, b) => a.order - b.order),
    cards,
    widgets,
    toolHosts,
    overlayKeys: [...new Set(overlayKeys)],
    workspaceContribution: {
      density: "FULL",
      sectionKeys: fullSections,
      primaryActionKeys: primaryActions,
      mountHandles: [`${s}.shell`],
    },
    unitWorkspaceContribution: {
      density: "FULL",
      sectionKeys: fullSections,
      primaryActionKeys: primaryActions,
      mountHandles: [`${s}.unit_shell`],
    },
    operationsCenterContribution: {
      density: "STATUS",
      sectionKeys:
        statusSections.length > 0 ? statusSections : (["HEADER"] as const),
      primaryActionKeys: [],
      mountHandles: [`${s}.oc_status`],
    },
    businessWorkspaceContribution: {
      density: "COMPACT",
      sectionKeys:
        compactSections.length > 0 ? compactSections : (["HEADER", "OVERVIEW"] as const),
      primaryActionKeys: primaryActions.slice(0, 2),
      mountHandles: [`${s}.bw_card`],
    },
    navigationContribution: {
      entries: [
        {
          id: `${s}.nav`,
          label: options.experienceName,
          sectionKey: "OVERVIEW",
        },
      ],
    },
    permissions: {
      readKeys,
      actionPermissionKeys,
    },
    analyticsKeys,
    aiContextKeys,
    queryScope: {
      domains: options.domains,
      grain: options.grain,
      rules: [
        "require_projected_scope",
        "enforce_facility_tenancy",
        `domain:${options.domains.join("|")}`,
      ],
    },
    statusContracts: {
      readinessSignalKeys: includeStatus ? [`${s}.readiness`] : [],
      statusKeys: includeStatus
        ? ["READY", "IN_PROGRESS", "NEEDS_ATTENTION", "DUE", "OVERDUE", "UNKNOWN"]
        : ["UNKNOWN"],
    },
    actions,
    extensionPoints: [
      `${s}.sections`,
      `${s}.cards`,
      `${s}.widgets`,
      `${s}.tool_hosts`,
      `${s}.overlay_slots`,
      `${s}.actions`,
    ],
    relationships: {
      relatedExperienceKeys: options.relatedExperienceKeys ?? [],
    },
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ExperienceContractIssue = {
  code: string;
  message: string;
};

const sectionKeySet = new Set<string>(EXPERIENCE_SECTION_KEYS);
const cardKindSet = new Set<string>(EXPERIENCE_CARD_KINDS);
const widgetKindSet = new Set<string>(EXPERIENCE_WIDGET_KINDS);
const densitySet = new Set<string>(EXPERIENCE_DENSITIES);
const actionCategorySet = new Set<string>(EXPERIENCE_ACTION_CATEGORIES);
const actionPlacementSet = new Set<string>(EXPERIENCE_ACTION_PLACEMENTS);
const grainSet = new Set<string>(QUERY_SCOPE_GRAINS);
const statusKeySet = new Set<string>(STATUS_VOCABULARY);
const forbiddenSectionSet = new Set<string>(FORBIDDEN_SECTION_KEYS);

export function isExperienceSectionKey(
  value: string,
): value is ExperienceSectionKey {
  return sectionKeySet.has(value);
}

export function isExperienceCardKind(value: string): value is ExperienceCardKind {
  return cardKindSet.has(value);
}

export function isExperienceWidgetKind(
  value: string,
): value is ExperienceWidgetKind {
  return widgetKindSet.has(value);
}

function validateHomeContribution(
  experienceKey: string,
  label: string,
  contribution: HomeContributionContract,
  sectionKeys: Set<string>,
  actionKeys: Set<string>,
  issues: ExperienceContractIssue[],
): void {
  if (!densitySet.has(contribution.density)) {
    issues.push({
      code: "invalid_home_density",
      message: `${experienceKey}: ${label} has invalid density ${contribution.density}`,
    });
  }
  if (contribution.sectionKeys.length === 0) {
    issues.push({
      code: "empty_home_sections",
      message: `${experienceKey}: ${label} must declare at least one section`,
    });
  }
  for (const sectionKey of contribution.sectionKeys) {
    if (forbiddenSectionSet.has(sectionKey)) {
      issues.push({
        code: "forbidden_section",
        message: `${experienceKey}: ${label} uses forbidden section ${sectionKey}`,
      });
    }
    if (!sectionKeys.has(sectionKey)) {
      issues.push({
        code: "home_section_not_declared",
        message: `${experienceKey}: ${label} references undeclared section ${sectionKey}`,
      });
    }
  }
  for (const actionKey of contribution.primaryActionKeys ?? []) {
    if (!actionKeys.has(actionKey)) {
      issues.push({
        code: "home_action_unknown",
        message: `${experienceKey}: ${label} primary action ${actionKey} not declared`,
      });
    }
  }
}

/**
 * Validate a single ExperienceContracts object for completeness and integrity.
 */
export function validateExperienceContracts(
  experienceKey: string,
  tools: readonly ExperienceToolKey[],
  contracts: ExperienceContracts,
  knownExperienceKeys?: ReadonlySet<string>,
): ExperienceContractIssue[] {
  const issues: ExperienceContractIssue[] = [];

  if (!contracts) {
    issues.push({
      code: "missing_contracts",
      message: `${experienceKey}: contracts are required`,
    });
    return issues;
  }

  if (typeof contracts.configurationSchema !== "object" || contracts.configurationSchema == null) {
    issues.push({
      code: "invalid_configuration_schema",
      message: `${experienceKey}: configurationSchema must be an object`,
    });
  }

  if (!contracts.availability || typeof contracts.availability !== "object") {
    issues.push({
      code: "missing_availability",
      message: `${experienceKey}: availability contract is required`,
    });
  }

  const sectionKeys = new Set<string>();
  let hasHeader = false;
  let hasOverview = false;

  for (const section of contracts.sections ?? []) {
    if (forbiddenSectionSet.has(section.key)) {
      issues.push({
        code: "forbidden_section",
        message: `${experienceKey}: forbidden section ${section.key}`,
      });
    }
    if (!isExperienceSectionKey(section.key)) {
      issues.push({
        code: "invalid_section_key",
        message: `${experienceKey}: invalid section key ${section.key}`,
      });
    }
    if (sectionKeys.has(section.key)) {
      issues.push({
        code: "duplicate_section_key",
        message: `${experienceKey}: duplicate section ${section.key}`,
      });
    }
    sectionKeys.add(section.key);
    if (section.key === "HEADER") hasHeader = true;
    if (section.key === "OVERVIEW") hasOverview = true;
  }

  if (!hasHeader) {
    issues.push({
      code: "missing_header_section",
      message: `${experienceKey}: HEADER section is required`,
    });
  }
  if (!hasOverview) {
    issues.push({
      code: "missing_overview_section",
      message: `${experienceKey}: OVERVIEW section is required`,
    });
  }

  const cardKeys = new Set<string>();
  const widgetKeys = new Set<string>();
  const toolHostKeys = new Set<string>();
  const actionKeys = new Set<string>();
  const overlayKeySet = new Set(contracts.overlayKeys ?? []);

  for (const widget of contracts.widgets ?? []) {
    if (widgetKeys.has(widget.key)) {
      issues.push({
        code: "duplicate_widget_key",
        message: `${experienceKey}: duplicate widget ${widget.key}`,
      });
    }
    widgetKeys.add(widget.key);
    if (!isExperienceWidgetKind(widget.kind)) {
      issues.push({
        code: "invalid_widget_kind",
        message: `${experienceKey}: invalid widget kind ${widget.kind}`,
      });
    }
    if (widget.overlayKey && !overlayKeySet.has(widget.overlayKey)) {
      issues.push({
        code: "widget_overlay_unknown",
        message: `${experienceKey}: widget ${widget.key} overlay ${widget.overlayKey} not in overlayKeys`,
      });
    }
  }

  for (const host of contracts.toolHosts ?? []) {
    if (toolHostKeys.has(host.key)) {
      issues.push({
        code: "duplicate_tool_host_key",
        message: `${experienceKey}: duplicate tool host ${host.key}`,
      });
    }
    toolHostKeys.add(host.key);
    if (!tools.includes(host.toolKind)) {
      issues.push({
        code: "tool_host_tool_not_declared",
        message: `${experienceKey}: tool host ${host.key} uses tool ${host.toolKind} not in experience.tools`,
      });
    }
    if (!sectionKeys.has(host.sectionKey)) {
      issues.push({
        code: "tool_host_section_unknown",
        message: `${experienceKey}: tool host ${host.key} section ${host.sectionKey} not declared`,
      });
    }
    if (!host.bindingSlot.trim()) {
      issues.push({
        code: "tool_host_missing_binding_slot",
        message: `${experienceKey}: tool host ${host.key} missing bindingSlot`,
      });
    }
  }

  for (const action of contracts.actions ?? []) {
    if (actionKeys.has(action.key)) {
      issues.push({
        code: "duplicate_action_key",
        message: `${experienceKey}: duplicate action ${action.key}`,
      });
    }
    actionKeys.add(action.key);
    if (!actionCategorySet.has(action.category)) {
      issues.push({
        code: "invalid_action_category",
        message: `${experienceKey}: invalid action category ${action.category}`,
      });
    }
    if (!actionPlacementSet.has(action.placement)) {
      issues.push({
        code: "invalid_action_placement",
        message: `${experienceKey}: invalid action placement ${action.placement}`,
      });
    }
    if (action.permissionKeys.length === 0) {
      issues.push({
        code: "action_missing_permissions",
        message: `${experienceKey}: action ${action.key} must declare permissionKeys`,
      });
    }
  }

  for (const card of contracts.cards ?? []) {
    if (cardKeys.has(card.key)) {
      issues.push({
        code: "duplicate_card_key",
        message: `${experienceKey}: duplicate card ${card.key}`,
      });
    }
    cardKeys.add(card.key);
    if (!isExperienceCardKind(card.kind)) {
      issues.push({
        code: "invalid_card_kind",
        message: `${experienceKey}: invalid card kind ${card.kind}`,
      });
    }
    if (!sectionKeys.has(card.sectionKey)) {
      issues.push({
        code: "card_section_unknown",
        message: `${experienceKey}: card ${card.key} section ${card.sectionKey} not declared`,
      });
    }
    if (!card.title.trim()) {
      issues.push({
        code: "card_missing_title",
        message: `${experienceKey}: card ${card.key} requires title`,
      });
    }
    for (const widgetKey of card.widgetKeys) {
      if (!widgetKeys.has(widgetKey)) {
        issues.push({
          code: "card_widget_unknown",
          message: `${experienceKey}: card ${card.key} unknown widget ${widgetKey}`,
        });
      }
    }
    for (const actionKey of card.actionKeys ?? []) {
      if (!actionKeys.has(actionKey)) {
        issues.push({
          code: "card_action_unknown",
          message: `${experienceKey}: card ${card.key} unknown action ${actionKey}`,
        });
      }
    }
    for (const overlayKey of card.overlayKeys ?? []) {
      if (!overlayKeySet.has(overlayKey)) {
        issues.push({
          code: "card_overlay_unknown",
          message: `${experienceKey}: card ${card.key} unknown overlay ${overlayKey}`,
        });
      }
    }
    if (card.kind === "TOOL_HOST") {
      if (!card.toolHostKey || !toolHostKeys.has(card.toolHostKey)) {
        issues.push({
          code: "tool_host_card_missing_host",
          message: `${experienceKey}: TOOL_HOST card ${card.key} must reference a declared toolHosts key`,
        });
      }
    }
  }

  for (const section of contracts.sections ?? []) {
    for (const cardKey of section.cardKeys) {
      if (!cardKeys.has(cardKey)) {
        issues.push({
          code: "section_card_unknown",
          message: `${experienceKey}: section ${section.key} unknown card ${cardKey}`,
        });
      }
    }
  }

  if (!contracts.queryScope?.domains?.length) {
    issues.push({
      code: "query_scope_missing_domains",
      message: `${experienceKey}: queryScope.domains required`,
    });
  }
  if (!grainSet.has(contracts.queryScope?.grain)) {
    issues.push({
      code: "invalid_query_scope_grain",
      message: `${experienceKey}: invalid queryScope.grain`,
    });
  }
  if (!contracts.queryScope?.rules?.length) {
    issues.push({
      code: "query_scope_missing_rules",
      message: `${experienceKey}: queryScope.rules required`,
    });
  }

  if (!contracts.permissions?.readKeys?.length) {
    issues.push({
      code: "permissions_missing_read",
      message: `${experienceKey}: permissions.readKeys required`,
    });
  }

  if (!Array.isArray(contracts.analyticsKeys)) {
    issues.push({
      code: "analytics_keys_required",
      message: `${experienceKey}: analyticsKeys array required (may be empty only if intentionally none — prefer at least one)`,
    });
  } else if (contracts.analyticsKeys.length === 0) {
    issues.push({
      code: "analytics_keys_empty",
      message: `${experienceKey}: analyticsKeys must declare at least one metric key`,
    });
  }

  if (!Array.isArray(contracts.aiContextKeys)) {
    issues.push({
      code: "ai_context_keys_required",
      message: `${experienceKey}: aiContextKeys array required (may be empty)`,
    });
  }

  if (!contracts.statusContracts) {
    issues.push({
      code: "missing_status_contracts",
      message: `${experienceKey}: statusContracts required`,
    });
  } else {
    for (const statusKey of contracts.statusContracts.statusKeys) {
      if (!statusKeySet.has(statusKey)) {
        issues.push({
          code: "invalid_status_key",
          message: `${experienceKey}: invalid status key ${statusKey}`,
        });
      }
    }
  }

  if (!contracts.extensionPoints?.length) {
    issues.push({
      code: "missing_extension_points",
      message: `${experienceKey}: extensionPoints required`,
    });
  }

  if (!contracts.navigationContribution?.entries) {
    issues.push({
      code: "missing_navigation_contribution",
      message: `${experienceKey}: navigationContribution.entries required (may be empty array)`,
    });
  }

  if (!Array.isArray(contracts.overlayKeys) || contracts.overlayKeys.length === 0) {
    issues.push({
      code: "overlay_keys_empty",
      message: `${experienceKey}: overlayKeys must declare at least one runtime overlay key`,
    });
  }

  const overlayDupes = new Set<string>();
  for (const overlayKey of contracts.overlayKeys ?? []) {
    if (overlayDupes.has(overlayKey)) {
      issues.push({
        code: "duplicate_overlay_key",
        message: `${experienceKey}: duplicate overlay key ${overlayKey}`,
      });
    }
    overlayDupes.add(overlayKey);
  }

  validateHomeContribution(
    experienceKey,
    "workspaceContribution",
    contracts.workspaceContribution,
    sectionKeys,
    actionKeys,
    issues,
  );
  validateHomeContribution(
    experienceKey,
    "unitWorkspaceContribution",
    contracts.unitWorkspaceContribution,
    sectionKeys,
    actionKeys,
    issues,
  );
  validateHomeContribution(
    experienceKey,
    "operationsCenterContribution",
    contracts.operationsCenterContribution,
    sectionKeys,
    actionKeys,
    issues,
  );
  validateHomeContribution(
    experienceKey,
    "businessWorkspaceContribution",
    contracts.businessWorkspaceContribution,
    sectionKeys,
    actionKeys,
    issues,
  );

  if (knownExperienceKeys) {
    for (const related of contracts.relationships?.relatedExperienceKeys ?? []) {
      if (!knownExperienceKeys.has(related)) {
        issues.push({
          code: "unknown_related_experience",
          message: `${experienceKey}: related Experience ${related} not in catalog`,
        });
      }
      if (related === experienceKey) {
        issues.push({
          code: "self_related_experience",
          message: `${experienceKey}: cannot relate to itself`,
        });
      }
    }
  }

  // If readiness signals declared, CURRENT_STATUS should exist
  if (
    (contracts.statusContracts?.readinessSignalKeys?.length ?? 0) > 0 &&
    !sectionKeys.has("CURRENT_STATUS")
  ) {
    issues.push({
      code: "status_without_section",
      message: `${experienceKey}: readiness signals require CURRENT_STATUS section`,
    });
  }

  return issues;
}

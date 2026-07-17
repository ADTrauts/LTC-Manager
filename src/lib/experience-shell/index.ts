/**
 * Wave 16A — Experience Shell foundation (pure model + registry).
 *
 * React renderers live in `@/components/experience-shell`.
 */

export type {
  ExperienceComponentKind,
  ExperienceRuntimeOverlay,
  ExperienceShellAction,
  ExperienceShellCard,
  ExperienceShellModel,
  ExperienceShellSection,
  ExperienceShellState,
  ExperienceShellToolHost,
  ExperienceShellWidget,
  ResolveExperienceShellInput,
} from "./types";

export { resolveExperienceShellModel } from "./resolve-shell-model";

export {
  clearComponentOverrides,
  isKnownComponentKind,
  registerComponentOverride,
  resolveComponentRenderer,
  resolveComponentRendererWithOverrides,
  type ExperienceRendererId,
} from "./component-registry";

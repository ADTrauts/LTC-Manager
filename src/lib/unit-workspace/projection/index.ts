/**
 * Wave 15H — Unit Workspace Projection cutover.
 */

export type {
  UnitWorkspaceActionEntry,
  UnitWorkspaceAreaPanel,
  UnitWorkspaceExperiencePanel,
  UnitWorkspaceProjectionSection,
  UnitWorkspaceProjectionView,
  UnitWorkspaceRoomContext,
  UnitWorkspaceToolEntry,
} from "./types";

export { adaptProjectionToUnitWorkspace } from "./adapt-projection";
export {
  loadUnitWorkspaceProjection,
  type LoadUnitWorkspaceProjectionOptions,
  type LoadUnitWorkspaceProjectionResult,
} from "./load";

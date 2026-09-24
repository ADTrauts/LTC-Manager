/**
 * Batch Runtime Location State loader.
 *
 * Projection chooses visible spaces. This loader composes operational truth.
 * It does not grant access or persist state.
 */

import { composeRuntimeLocationStates } from "./compose";
import { prefetchRuntimeLocationInputs } from "./prefetch";
import type {
  LoadRuntimeLocationStatesInput,
  RuntimeLocationPrefetchStats,
  RuntimeLocationState,
} from "./types";

export type LoadedRuntimeLocationStates = {
  states: RuntimeLocationState[];
  stats: RuntimeLocationPrefetchStats;
};

export async function loadRuntimeLocationStates(
  input: LoadRuntimeLocationStatesInput,
): Promise<LoadedRuntimeLocationStates> {
  const prefetched = await prefetchRuntimeLocationInputs(input);
  return {
    states: composeRuntimeLocationStates(prefetched),
    stats: prefetched.stats,
  };
}

export async function loadRuntimeLocationState(
  input: Omit<LoadRuntimeLocationStatesInput, "spaceRefs"> & {
    spaceRef: LoadRuntimeLocationStatesInput["spaceRefs"][number];
  },
): Promise<RuntimeLocationState | null> {
  const loaded = await loadRuntimeLocationStates({
    ...input,
    spaceRefs: [input.spaceRef],
  });
  return loaded.states[0] ?? null;
}

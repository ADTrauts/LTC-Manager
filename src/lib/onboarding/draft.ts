export const SETUP_VIEWS = ["site", "products", "builders", "people"] as const;
export type SetupView = typeof SETUP_VIEWS[number];
export type SetupDraft = { version: 3; facilityId: string; view: SetupView; selectedKeys: string[] };
export const setupDraftKey = (userId: string, facilityId: string) => `vssyl.setup/3/${userId}/${facilityId}`;
export function readSetupDraft(raw: string | null, facilityId: string, availableKeys: readonly string[], fallback: SetupView): SetupDraft {
  let value: Partial<SetupDraft> = {};
  try { value = raw ? JSON.parse(raw) : {}; } catch { /* invalid browser draft is ignored */ }
  if (!value || value.version !== 3 || value.facilityId !== facilityId) value = {};
  return { version: 3, facilityId, view: SETUP_VIEWS.includes(value.view as SetupView) ? value.view as SetupView : fallback,
    selectedKeys: Array.isArray(value.selectedKeys) ? [...new Set(value.selectedKeys.filter((key) => availableKeys.includes(key)))] : [] };
}

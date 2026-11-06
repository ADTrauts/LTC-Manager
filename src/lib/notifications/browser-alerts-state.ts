/**
 * What the Notifications settings screen may say about this browser.
 * Permission is requested only from the Enable control, never from this function.
 */

export type BrowserPermissionState = "default" | "granted" | "denied" | "unsupported";

export type BrowserAlertPresentation =
  | "not_enabled"
  | "enabled"
  | "blocked"
  | "unavailable";

export function presentBrowserAlerts(input: {
  supported: boolean;
  permission: BrowserPermissionState;
  browserSubscribed: boolean;
  serverEnabled: boolean;
  publicKeyAvailable: boolean;
}): BrowserAlertPresentation {
  if (!input.supported || input.permission === "unsupported") return "unavailable";
  if (!input.publicKeyAvailable) return "unavailable";
  if (input.permission === "denied") return "blocked";
  if (input.permission === "granted" && input.browserSubscribed && input.serverEnabled) return "enabled";
  return "not_enabled";
}

export function browserAlertStatusLabel(state: BrowserAlertPresentation): string {
  switch (state) {
    case "enabled":
      return "Enabled on this device";
    case "blocked":
      return "Blocked by browser";
    case "unavailable":
      return "Not available on this device";
    case "not_enabled":
      return "Not enabled";
  }
}

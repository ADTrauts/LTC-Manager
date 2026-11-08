"use client";

import { useEffect, useState } from "react";

import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import { browserAlertStatusLabel, type BrowserAlertPresentation } from "@/lib/notifications/browser-alerts-state";
import {
  disableBrowserAlerts,
  enableBrowserAlerts,
  loadBrowserAlertPresentation,
} from "@/lib/notifications/browser-push-client";

export function BrowserAlertsPanel({ deliveryActive }: { deliveryActive: boolean }) {
  const [state, setState] = useState<BrowserAlertPresentation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadBrowserAlertPresentation().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onEnable() {
    setPending(true);
    setMessage(null);
    try {
      const result = await enableBrowserAlerts();
      setState(result.state);
      setMessage(result.ok ? null : result.message);
    } finally {
      setPending(false);
    }
  }

  async function onDisable() {
    setPending(true);
    setMessage(null);
    try {
      const result = await disableBrowserAlerts();
      setState(result.state);
      setMessage(result.ok ? null : result.message);
    } finally {
      setPending(false);
    }
  }

  const label = state ? browserAlertStatusLabel(state) : "Checking this device";

  return (
    <section className="space-y-4" data-testid="browser-alerts-panel">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Browser alerts</h2>
        <div className="mt-2 space-y-2 text-sm text-zinc-600" data-testid="browser-alerts-explanation">
          <p>Browser alerts can notify you about operational attention on this personal device.</p>
          <p>The Notification Center remains available in Vssyl.</p>
          <p>Do not enable personal alerts on a shared facility tablet.</p>
          <p>Signing out turns browser alerts off on every device for this account. Other devices stay signed in and must be enabled again.</p>
          {deliveryActive ? null : (
            <p data-testid="browser-alerts-delivery">Browser delivery is not active yet.</p>
          )}
        </div>
      </div>
      <p className="text-sm font-medium text-zinc-900" data-testid="browser-alerts-state">
        {label}
      </p>
      {message ? (
        <p className="text-sm text-zinc-700" role="status" data-testid="browser-alerts-message">
          {message}
        </p>
      ) : null}
      {state === "not_enabled" ? (
        <button
          type="button"
          className={`inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 ${FOCUS_RING_CLASS}`}
          data-testid="browser-alerts-enable"
          disabled={pending}
          onClick={() => {
            void onEnable();
          }}
        >
          {pending ? "Enabling…" : "Enable alerts on this device"}
        </button>
      ) : null}
      {state === "enabled" ? (
        <button
          type="button"
          className={`inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 ${FOCUS_RING_CLASS}`}
          data-testid="browser-alerts-disable"
          disabled={pending}
          onClick={() => {
            void onDisable();
          }}
        >
          {pending ? "Disabling…" : "Disable alerts on this device"}
        </button>
      ) : null}
      {state === "blocked" ? (
        <p className="text-sm text-zinc-600">Change notification permission in this browser’s site settings.</p>
      ) : null}
    </section>
  );
}

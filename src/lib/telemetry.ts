type TelemetryPayload = Record<string, unknown>;
type TelemetryListener = (event: string, payload: TelemetryPayload) => void;

const telemetryListeners = new Set<TelemetryListener>();

/** Observe one process's events without replacing the shared console. */
export function subscribeTelemetry(listener: TelemetryListener): () => void {
  telemetryListeners.add(listener);
  return () => {
    telemetryListeners.delete(listener);
  };
}

export async function trackEvent(event: string, payload: TelemetryPayload): Promise<void> {
  console.info(
    JSON.stringify({
      at: new Date().toISOString(),
      event,
      payload,
    }),
  );
  for (const listener of telemetryListeners) {
    try {
      listener(event, payload);
    } catch {
      // A diagnostic subscriber cannot change the write that emitted the event.
    }
  }
}

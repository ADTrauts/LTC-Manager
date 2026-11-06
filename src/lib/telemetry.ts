type TelemetryPayload = Record<string, unknown>;

export async function trackEvent(event: string, payload: TelemetryPayload): Promise<void> {
  console.info(
    JSON.stringify({
      at: new Date().toISOString(),
      event,
      payload,
    }),
  );
}

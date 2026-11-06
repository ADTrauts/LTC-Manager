declare module "web-push" {
  interface WebPushApi {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
      payload: string | null,
      options?: { TTL?: number; urgency?: "very-low" | "low" | "normal" | "high"; timeout?: number },
    ): Promise<{ statusCode?: number }>;
  }

  const webpush: WebPushApi;
  export default webpush;
}

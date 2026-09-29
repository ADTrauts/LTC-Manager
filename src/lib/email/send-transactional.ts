import { ServerClient } from "postmark";

import {
  getEmailFromAddress,
  getEmailMessageStream,
  getPostmarkServerToken,
  isEmailConfigured,
} from "@/lib/email/config";

export type SendTransactionalEmailInput = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  tag?: string;
};

export type SendTransactionalEmailResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: "not_configured" }
  | { sent: false; reason: "send_failed"; error: string };

type EnvLike = Record<string, string | undefined>;

type PostmarkLikeClient = {
  sendEmail: (message: {
    From: string;
    To: string;
    Subject: string;
    HtmlBody?: string;
    TextBody?: string;
    Tag?: string;
    MessageStream?: string;
  }) => Promise<{ MessageID?: string }>;
};

let sharedClient: ServerClient | null = null;

function getSharedClient(token: string): ServerClient {
  if (!sharedClient) {
    sharedClient = new ServerClient(token);
  }
  return sharedClient;
}

/** Test-only: clear the cached Postmark client between hermetic cases. */
export function resetPostmarkClientForTests(): void {
  sharedClient = null;
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput,
  options?: {
    env?: EnvLike;
    client?: PostmarkLikeClient;
  },
): Promise<SendTransactionalEmailResult> {
  const env = options?.env ?? process.env;
  if (!isEmailConfigured(env)) {
    return { sent: false, reason: "not_configured" };
  }

  const token = getPostmarkServerToken(env);
  if (!token) {
    return { sent: false, reason: "not_configured" };
  }

  const to = input.to.trim();
  const subject = input.subject.trim();
  if (!to || !subject) {
    return { sent: false, reason: "send_failed", error: "Missing to or subject." };
  }
  if (!input.html?.trim() && !input.text?.trim()) {
    return { sent: false, reason: "send_failed", error: "Missing html or text body." };
  }

  const client = options?.client ?? getSharedClient(token);

  try {
    const response = await client.sendEmail({
      From: getEmailFromAddress(env),
      To: to,
      Subject: subject,
      HtmlBody: input.html?.trim() || undefined,
      TextBody: input.text?.trim() || undefined,
      Tag: input.tag?.trim() || undefined,
      MessageStream: getEmailMessageStream(env),
    });
    return {
      sent: true,
      messageId: response.MessageID?.trim() || "unknown",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Postmark send failed.";
    return { sent: false, reason: "send_failed", error: message };
  }
}

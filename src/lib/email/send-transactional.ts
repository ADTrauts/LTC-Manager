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

export type SendTemplatedEmailInput = {
  to: string;
  templateAlias: string;
  templateModel: Record<string, string | number | boolean | null | undefined>;
  tag?: string;
  /** Optional override; Postmark templates usually own the subject. */
  subject?: string;
  /** Overrides the shared sender, e.g. a dedicated support address. */
  from?: string;
  replyTo?: string | null;
  headers?: EmailHeader[];
  /** Postmark Metadata; echoed back on delivery/bounce webhooks. */
  metadata?: Record<string, string>;
};

export type EmailHeader = { name: string; value: string };

export type SendTransactionalEmailResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: "not_configured" }
  | { sent: false; reason: "send_failed"; error: string };

type EnvLike = Record<string, string | undefined>;

type PostmarkLikeClient = {
  sendEmail?: (message: {
    From: string;
    To: string;
    Subject: string;
    HtmlBody?: string;
    TextBody?: string;
    Tag?: string;
    MessageStream?: string;
  }) => Promise<{ MessageID?: string }>;
  sendEmailWithTemplate?: (message: {
    From: string;
    To: string;
    TemplateAlias: string;
    TemplateModel: Record<string, unknown>;
    ReplyTo?: string;
    Tag?: string;
    MessageStream?: string;
    InlineCss?: boolean;
    Headers?: Array<{ Name: string; Value: string }>;
    Metadata?: Record<string, string>;
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

function requireConfiguredToken(
  env: EnvLike,
): { ok: true; token: string } | { ok: false; result: SendTransactionalEmailResult } {
  if (!isEmailConfigured(env)) {
    return { ok: false, result: { sent: false, reason: "not_configured" } };
  }
  const token = getPostmarkServerToken(env);
  if (!token) {
    return { ok: false, result: { sent: false, reason: "not_configured" } };
  }
  return { ok: true, token };
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput,
  options?: {
    env?: EnvLike;
    client?: PostmarkLikeClient;
  },
): Promise<SendTransactionalEmailResult> {
  const env = options?.env ?? process.env;
  const configured = requireConfiguredToken(env);
  if (!configured.ok) return configured.result;

  const to = input.to.trim();
  const subject = input.subject.trim();
  if (!to || !subject) {
    return { sent: false, reason: "send_failed", error: "Missing to or subject." };
  }
  if (!input.html?.trim() && !input.text?.trim()) {
    return { sent: false, reason: "send_failed", error: "Missing html or text body." };
  }

  const client = options?.client ?? getSharedClient(configured.token);
  if (!client.sendEmail) {
    return { sent: false, reason: "send_failed", error: "Postmark sendEmail unavailable." };
  }

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

export async function sendTemplatedEmail(
  input: SendTemplatedEmailInput,
  options?: {
    env?: EnvLike;
    client?: PostmarkLikeClient;
  },
): Promise<SendTransactionalEmailResult> {
  const env = options?.env ?? process.env;
  const configured = requireConfiguredToken(env);
  if (!configured.ok) return configured.result;

  const to = input.to.trim();
  const templateAlias = input.templateAlias.trim();
  if (!to || !templateAlias) {
    return { sent: false, reason: "send_failed", error: "Missing to or template alias." };
  }

  const client = options?.client ?? getSharedClient(configured.token);
  if (!client.sendEmailWithTemplate) {
    return {
      sent: false,
      reason: "send_failed",
      error: "Postmark sendEmailWithTemplate unavailable.",
    };
  }

  const templateModel: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.templateModel)) {
    if (value === undefined) continue;
    templateModel[key] = value;
  }

  try {
    const response = await client.sendEmailWithTemplate({
      From: input.from?.trim() || getEmailFromAddress(env),
      To: to,
      TemplateAlias: templateAlias,
      TemplateModel: templateModel,
      ...(input.replyTo?.trim() ? { ReplyTo: input.replyTo.trim() } : {}),
      Tag: input.tag?.trim() || undefined,
      MessageStream: getEmailMessageStream(env),
      InlineCss: true,
      ...(input.headers?.length
        ? { Headers: input.headers.map((header) => ({ Name: header.name, Value: header.value })) }
        : {}),
      ...(input.metadata && Object.keys(input.metadata).length > 0
        ? { Metadata: input.metadata }
        : {}),
    });
    return {
      sent: true,
      messageId: response.MessageID?.trim() || "unknown",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Postmark template send failed.";
    return { sent: false, reason: "send_failed", error: message };
  }
}

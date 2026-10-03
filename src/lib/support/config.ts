import { getEmailFromAddress } from "@/lib/email/config";

import { normalizeSupportEmail } from "./contacts";

type EnvLike = Record<string, string | undefined>;

export type SupportInboundCredentials = { username: string; password: string };

/** Basic Auth credentials Postmark must present on the inbound webhook URL. */
export function getSupportInboundCredentials(env: EnvLike = process.env): SupportInboundCredentials | null {
  const username = env.POSTMARK_INBOUND_WEBHOOK_USERNAME?.trim();
  const password = env.POSTMARK_INBOUND_WEBHOOK_PASSWORD?.trim();
  return username && password ? { username, password } : null;
}

/**
 * Basic Auth for outbound Delivery / Bounce / Spam Complaint webhooks.
 * Separate from inbound: Postmark inbound and outbound webhooks are different products.
 */
export function getSupportOutboundWebhookCredentials(env: EnvLike = process.env): SupportInboundCredentials | null {
  const username = env.POSTMARK_OUTBOUND_WEBHOOK_USERNAME?.trim();
  const password = env.POSTMARK_OUTBOUND_WEBHOOK_PASSWORD?.trim();
  return username && password ? { username, password } : null;
}

/** Sender for support replies. Falls back to the shared transactional sender. */
export function getSupportFromAddress(env: EnvLike = process.env): string {
  return env.SUPPORT_FROM_EMAIL?.trim() || getEmailFromAddress(env);
}

/** `Name <a@b>` or `a@b` → `a@b`, lowercased. Null when no address is present. */
export function extractEmailAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const bracketed = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  const bare = bracketed?.[1] ?? value.trim().match(/^[^\s<>@]+@[^\s<>@]+$/)?.[0];
  return bare ? normalizeSupportEmail(bare) : null;
}

function parseReplyBaseAddress(env: EnvLike): { local: string; domain: string } | null {
  const address = extractEmailAddress(env.SUPPORT_REPLY_ADDRESS);
  if (!address) return null;
  const at = address.lastIndexOf("@");
  const local = address.slice(0, at).split("+")[0];
  const domain = address.slice(at + 1);
  return local && domain ? { local, domain } : null;
}

/**
 * `support+{replyToken}@{inbound domain}`. Null unless both the reply address and the inbound
 * webhook credentials are configured, so replies are never routed to an address nobody receives.
 */
export function getSupportReplyToAddress(replyToken: string, env: EnvLike = process.env): string | null {
  const base = parseReplyBaseAddress(env);
  if (!base || !getSupportInboundCredentials(env)) return null;
  return `${base.local}+${replyToken}@${base.domain}`;
}

export function isSupportReplyRoutingConfigured(env: EnvLike = process.env): boolean {
  return Boolean(parseReplyBaseAddress(env) && getSupportInboundCredentials(env));
}

/** Mail from these addresses is Vssyl talking to itself and is never turned into tickets. */
export function isSupportOwnAddress(email: string, env: EnvLike = process.env): boolean {
  const sender = normalizeSupportEmail(email);
  for (const value of [getSupportFromAddress(env), getEmailFromAddress(env)]) {
    if (extractEmailAddress(value) === sender) return true;
  }
  const reply = parseReplyBaseAddress(env);
  if (!reply) return false;
  const at = sender.lastIndexOf("@");
  return sender.slice(at + 1) === reply.domain && sender.slice(0, at).split("+")[0] === reply.local;
}

import { z } from "zod";

import { extractEmailAddress } from "./config";

const MAX_TEXT_LENGTH = 100_000;
const MAX_HTML_LENGTH = 1_000_000;
const MAX_HEADERS = 200;
const MAX_HEADER_VALUE_LENGTH = 4_000;
const MAX_REFERENCES = 50;
const MAX_SUBJECT_LENGTH = 200;
const MAX_ATTACHMENTS = 100;
export const SUPPORT_EMPTY_SUBJECT = "(No subject)";

const optionalString = z.string().nullish();
const address = z.object({
  Email: optionalString,
  Name: optionalString,
  MailboxHash: optionalString,
});

/** Only the Postmark inbound fields Vssyl reads. Unknown fields are ignored, never stored. */
export const postmarkInboundSchema = z.object({
  MessageID: z.string().trim().min(1).max(200),
  From: optionalString,
  FromName: optionalString,
  FromFull: address.nullish(),
  To: optionalString,
  ToFull: z.array(address).nullish(),
  Cc: optionalString,
  CcFull: z.array(address).nullish(),
  ReplyTo: optionalString,
  Subject: optionalString,
  Date: optionalString,
  MailboxHash: optionalString,
  TextBody: optionalString,
  HtmlBody: optionalString,
  StrippedTextReply: optionalString,
  OriginalRecipient: optionalString,
  Headers: z.array(z.object({ Name: z.string(), Value: z.string().nullish() })).nullish(),
  Attachments: z
    .array(
      z.object({
        Name: optionalString,
        ContentType: optionalString,
        ContentLength: z.number().nullish(),
        ContentID: optionalString,
      }),
    )
    .nullish(),
});

export type PostmarkInboundPayload = z.infer<typeof postmarkInboundSchema>;

export type SupportEmailHeader = { name: string; value: string };

export type SupportAttachmentManifestEntry = {
  name: string | null;
  contentType: string | null;
  contentLength: number | null;
  contentId: string | null;
};

export type InboundSupportEmail = {
  providerMessageId: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  replyTo: string | null;
  /** Raw subject as received. */
  subject: string | null;
  mailboxHashes: string[];
  internetMessageId: string | null;
  inReplyTo: string | null;
  references: string[];
  headers: SupportEmailHeader[];
  bodyText: string;
  bodyHtml: string | null;
  strippedReplyText: string | null;
  attachments: SupportAttachmentManifestEntry[];
  autoSubmitted: boolean;
};

export type InboundParseResult =
  | { ok: true; email: InboundSupportEmail }
  | { ok: false; reason: "invalid_payload" | "missing_sender" };

function clip(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function findHeader(headers: SupportEmailHeader[], name: string): string | null {
  const wanted = name.toLowerCase();
  return headers.find((header) => header.name.toLowerCase() === wanted)?.value ?? null;
}

/** `<a@b> <c@d>` → `["a@b", "c@d"]`, stored without angle brackets like outbound ids. */
export function parseMessageIds(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  const bracketed = [...value.matchAll(/<([^<>\s]+)>/g)].map((match) => match[1]);
  if (bracketed.length > 0) return bracketed;
  const bare = value.trim();
  return /^[^\s<>]+@[^\s<>]+$/.test(bare) ? [bare] : [];
}

/**
 * RFC 3834 Auto-Submitted plus the common Precedence / X-Autoreply markers. Such mail is recorded but
 * never reopens a ticket, so an out-of-office reply cannot bounce a ticket between states.
 */
export function isAutoSubmitted(headers: SupportEmailHeader[]): boolean {
  const autoSubmitted = findHeader(headers, "Auto-Submitted")?.trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  const precedence = findHeader(headers, "Precedence")?.trim().toLowerCase();
  if (precedence && ["bulk", "junk", "list", "auto_reply"].includes(precedence)) return true;
  return Boolean(
    findHeader(headers, "X-Autoreply") ||
      findHeader(headers, "X-Autorespond") ||
      findHeader(headers, "X-Auto-Response-Suppress")?.toLowerCase().includes("all"),
  );
}

export function isPossibleSpam(headers: SupportEmailHeader[]): boolean {
  return /^\s*yes\b/i.test(findHeader(headers, "X-Spam-Status") ?? "");
}

const REPLY_PREFIX = /^\s*(?:(?:re|fw|fwd|aw|sv|wg|vs|antw)\s*(?:\[\d+\])?\s*:\s*)+/i;
const TICKET_MARKER = /\[\s*VSS-(\d{1,9})\s*\]/gi;

/** `[VSS-1234]` markers in a subject, as ticket numbers. */
export function parseTicketMarkers(subject: string | null | undefined): number[] {
  if (!subject) return [];
  const numbers = [...subject.matchAll(TICKET_MARKER)].map((match) => Number(match[1]));
  return [...new Set(numbers.filter((value) => Number.isSafeInteger(value) && value > 0))];
}

/** Subject for a new ticket: reply/forward prefixes and stale ticket markers removed. */
export function normalizeInboundSubject(subject: string | null | undefined): string {
  let value = (subject ?? "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 5; i++) {
    const next = value.replace(REPLY_PREFIX, "").replace(TICKET_MARKER, " ").replace(/\s+/g, " ").trim();
    if (next === value) break;
    value = next;
  }
  return value.slice(0, MAX_SUBJECT_LENGTH) || SUPPORT_EMPTY_SUBJECT;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/**
 * Plain text from untrusted HTML, for display only. The result is rendered as text, never as markup,
 * so no tag or attribute from the email can reach the Console DOM.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|title|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|section|article|table)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/<[^>]*$/g, "");
  return decodeEntities(text)
    .replace(/[<>]/g, (char) => (char === "<" ? "‹" : "›"))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Console preference: Postmark's stripped reply, then the text body, then text derived from HTML. */
export function inboundDisplayBody(message: {
  strippedReplyText: string | null;
  bodyText: string;
  bodyHtml: string | null;
}): string {
  return message.strippedReplyText?.trim() || message.bodyText.trim() || htmlToPlainText(message.bodyHtml);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Reads SupportTicketMessage.inboundHeaders back; anything malformed is skipped. */
export function readStoredHeaders(value: unknown): SupportEmailHeader[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    entry && typeof entry === "object" && typeof entry.name === "string"
      ? [{ name: entry.name, value: typeof entry.value === "string" ? entry.value : "" }]
      : [],
  );
}

/** Reads SupportTicketMessage.attachmentManifest back; anything malformed is skipped. */
export function readAttachmentManifest(value: unknown): SupportAttachmentManifestEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    entry && typeof entry === "object"
      ? [
          {
            name: stringOrNull(entry.name),
            contentType: stringOrNull(entry.contentType),
            contentLength: typeof entry.contentLength === "number" ? entry.contentLength : null,
            contentId: stringOrNull(entry.contentId),
          },
        ]
      : [],
  );
}

function addressList(full: PostmarkInboundPayload["ToFull"], raw: string | null | undefined): string[] {
  const fromFull = (full ?? []).map((entry) => extractEmailAddress(entry.Email)).filter(Boolean) as string[];
  const fromRaw = fromFull.length
    ? []
    : (raw ?? "")
        .split(",")
        .map((part) => extractEmailAddress(part))
        .filter(Boolean) as string[];
  return [...new Set([...fromFull, ...fromRaw])];
}

function mailboxHashes(payload: PostmarkInboundPayload): string[] {
  const values = [
    payload.MailboxHash,
    ...(payload.ToFull ?? []).map((entry) => entry.MailboxHash),
    ...(payload.CcFull ?? []).map((entry) => entry.MailboxHash),
  ];
  return [...new Set(values.map((value) => value?.trim().toLowerCase()).filter(Boolean) as string[])];
}

export function parsePostmarkInbound(raw: unknown): InboundParseResult {
  const parsed = postmarkInboundSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid_payload" };
  const payload = parsed.data;

  const fromEmail = extractEmailAddress(payload.FromFull?.Email) ?? extractEmailAddress(payload.From);
  if (!fromEmail) return { ok: false, reason: "missing_sender" };

  const headers = (payload.Headers ?? []).slice(0, MAX_HEADERS).map((header) => ({
    name: header.Name.slice(0, 200),
    value: (header.Value ?? "").slice(0, MAX_HEADER_VALUE_LENGTH),
  }));

  return {
    ok: true,
    email: {
      providerMessageId: payload.MessageID,
      fromEmail,
      fromName: clip(payload.FromFull?.Name ?? payload.FromName, 200),
      toEmails: addressList(payload.ToFull, payload.To),
      ccEmails: addressList(payload.CcFull, payload.Cc),
      replyTo: clip(payload.ReplyTo, 500),
      subject: clip(payload.Subject, 1_000),
      mailboxHashes: mailboxHashes(payload),
      internetMessageId: parseMessageIds(findHeader(headers, "Message-ID"))[0] ?? null,
      inReplyTo: parseMessageIds(findHeader(headers, "In-Reply-To"))[0] ?? null,
      references: parseMessageIds(findHeader(headers, "References")).slice(-MAX_REFERENCES),
      headers,
      bodyText: (payload.TextBody ?? "").slice(0, MAX_TEXT_LENGTH),
      bodyHtml: payload.HtmlBody ? payload.HtmlBody.slice(0, MAX_HTML_LENGTH) : null,
      strippedReplyText: clip(payload.StrippedTextReply, MAX_TEXT_LENGTH),
      attachments: (payload.Attachments ?? []).slice(0, MAX_ATTACHMENTS).map((attachment) => ({
        name: clip(attachment.Name, 300),
        contentType: clip(attachment.ContentType, 200),
        contentLength: attachment.ContentLength ?? null,
        contentId: clip(attachment.ContentID, 300),
      })),
      autoSubmitted: isAutoSubmitted(headers),
    },
  };
}

/** Base64 bodies from the raw Postmark payload. Never stored on the parsed email object. */
export function readInboundAttachmentContents(raw: unknown): Array<string | null> {
  if (!raw || typeof raw !== "object" || !("Attachments" in raw) || !Array.isArray(raw.Attachments)) {
    return [];
  }
  return raw.Attachments.slice(0, MAX_ATTACHMENTS).map((entry) => {
    if (!entry || typeof entry !== "object" || !("Content" in entry)) return null;
    const content = entry.Content;
    return typeof content === "string" && content.trim() ? content.trim() : null;
  });
}

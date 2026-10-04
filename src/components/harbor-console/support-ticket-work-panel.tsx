"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { applySupportMacroAction } from "@/app/console/(staff)/tickets/actions";
import { SUPPORT_TICKET_STATUS_LABEL } from "@/lib/support/labels";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm";

export type SupportSavedReplyOption = {
  id: string;
  name: string;
  renderedBody: string;
};

export type SupportMacroOption = {
  id: string;
  name: string;
  description: string | null;
  preview: string[];
};

function draftKey(ticketId: string) {
  return `vssyl-support-draft:${ticketId}`;
}

function statusKey(ticketId: string) {
  return `vssyl-support-status-after-reply:${ticketId}`;
}

export function SupportTicketWorkPanel({
  ticketId,
  replies,
  macros,
  currentStatus,
  replyDefault,
  transitions,
}: {
  ticketId: string;
  replies: SupportSavedReplyOption[];
  macros: SupportMacroOption[];
  currentStatus: keyof typeof SUPPORT_TICKET_STATUS_LABEL;
  replyDefault: string;
  transitions: readonly (keyof typeof SUPPORT_TICKET_STATUS_LABEL)[];
}) {
  const [body, setBody] = useState("");
  const [statusAfterReply, setStatusAfterReply] = useState(replyDefault);
  const [selectedReplyId, setSelectedReplyId] = useState("");
  const [selectedMacroId, setSelectedMacroId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(draftKey(ticketId));
      if (stored) setBody(stored);
      const storedStatus = sessionStorage.getItem(statusKey(ticketId));
      if (storedStatus !== null) setStatusAfterReply(storedStatus);
    } catch {
      /* ignore */
    }
  }, [ticketId]);

  useEffect(() => {
    try {
      if (body) sessionStorage.setItem(draftKey(ticketId), body);
      else sessionStorage.removeItem(draftKey(ticketId));
    } catch {
      /* ignore */
    }
  }, [body, ticketId]);

  const selectedReply = replies.find((reply) => reply.id === selectedReplyId) ?? null;
  const selectedMacro = useMemo(
    () => macros.find((macro) => macro.id === selectedMacroId) ?? null,
    [macros, selectedMacroId],
  );
  const hasDraft = Boolean(body.trim());

  function insertReply(mode: "append" | "replace", text: string) {
    setBody((current) => {
      if (mode === "replace" || !current.trim()) return text;
      return `${current.replace(/\s+$/, "")}\n\n${text}`;
    });
  }

  function applyMacro() {
    if (!selectedMacro) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await applySupportMacroAction(ticketId, selectedMacro.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.draftBody) {
        setBody((current) => {
          const next = !current.trim()
            ? result.draftBody!
            : `${current.replace(/\s+$/, "")}\n\n${result.draftBody}`;
          try {
            sessionStorage.setItem(draftKey(ticketId), next);
          } catch {
            /* ignore */
          }
          return next;
        });
      }
      if (result.statusAfterReply) {
        setStatusAfterReply(result.statusAfterReply);
        try {
          sessionStorage.setItem(statusKey(ticketId), result.statusAfterReply);
        } catch {
          /* ignore */
        }
      }
      setNotice(result.notice);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {macros.length > 0 ? (
        <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-[12rem] flex-1 text-sm">
              <span className="font-medium">Apply macro</span>
              <select
                value={selectedMacroId}
                onChange={(event) => {
                  setSelectedMacroId(event.target.value);
                  setNotice(null);
                  setError(null);
                }}
                className={INPUT_CLASS}
                aria-label="Choose a macro"
              >
                <option value="">Choose a macro…</option>
                {macros.map((macro) => (
                  <option key={macro.id} value={macro.id}>
                    {macro.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!selectedMacro || pending}
              onClick={applyMacro}
              className="rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {pending ? "Applying…" : "Apply"}
            </button>
          </div>
          {selectedMacro ? (
            <div className="text-xs text-[var(--text-secondary)]">
              {selectedMacro.description ? <p className="mb-1">{selectedMacro.description}</p> : null}
              <p className="font-medium text-[var(--foreground)]">Will:</p>
              <ul className="mt-1 list-disc pl-4">
                {selectedMacro.preview.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-2">Nothing is emailed until you send the reply.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {replies.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[12rem] flex-1 text-sm">
            <span className="font-medium">Saved reply</span>
            <select
              value={selectedReplyId}
              onChange={(event) => setSelectedReplyId(event.target.value)}
              className={INPUT_CLASS}
              aria-label="Choose a saved reply"
            >
              <option value="">Insert saved reply…</option>
              {replies.map((reply) => (
                <option key={reply.id} value={reply.id}>
                  {reply.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!selectedReply}
            onClick={() => selectedReply && insertReply("append", selectedReply.renderedBody)}
            className="rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Insert
          </button>
          {hasDraft ? (
            <button
              type="button"
              disabled={!selectedReply}
              onClick={() => selectedReply && insertReply("replace", selectedReply.renderedBody)}
              className="rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline disabled:opacity-50"
            >
              Replace draft
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-[var(--text-secondary)]">{notice}</p> : null}

      <label className="block text-sm">
        <span className="font-medium">Reply to customer</span>
        <textarea
          name="body"
          required
          maxLength={8000}
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className={INPUT_CLASS}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Status after reply</span>
        <select
          name="status"
          value={statusAfterReply}
          onChange={(event) => setStatusAfterReply(event.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">Keep {SUPPORT_TICKET_STATUS_LABEL[currentStatus]}</option>
          {transitions.map((status) => (
            <option key={status} value={status}>
              {SUPPORT_TICKET_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

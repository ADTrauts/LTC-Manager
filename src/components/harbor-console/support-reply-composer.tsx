"use client";

import { useState } from "react";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm";

export type SupportSavedReplyOption = {
  id: string;
  name: string;
  renderedBody: string;
};

export function SupportReplyComposer({
  replies,
}: {
  replies: SupportSavedReplyOption[];
}) {
  const [body, setBody] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const selected = replies.find((reply) => reply.id === selectedId) ?? null;
  const hasDraft = Boolean(body.trim());

  function insert(mode: "append" | "replace") {
    if (!selected) return;
    setBody((current) => {
      if (mode === "replace" || !current.trim()) return selected.renderedBody;
      return `${current.replace(/\s+$/, "")}\n\n${selected.renderedBody}`;
    });
  }

  return (
    <div className="space-y-3">
      {replies.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[12rem] flex-1 text-sm">
            <span className="font-medium">Saved reply</span>
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
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
            disabled={!selected}
            onClick={() => insert("append")}
            className="rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Insert
          </button>
          {hasDraft ? (
            <button
              type="button"
              disabled={!selected}
              onClick={() => insert("replace")}
              className="rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline disabled:opacity-50"
            >
              Replace draft
            </button>
          ) : null}
        </div>
      ) : null}
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
    </div>
  );
}

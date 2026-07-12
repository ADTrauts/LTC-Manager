"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  archiveKnowledgeArticleAction,
  publishKnowledgeArticleAction,
  restoreKnowledgeArticleAction,
} from "@/app/(protected)/admin/knowledge/actions";

type KnowledgeArticleLifecycleActionsProps = {
  articleId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};

export function KnowledgeArticleLifecycleActions({
  articleId,
  status,
}: KnowledgeArticleLifecycleActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" ? (
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          onClick={() => {
            const formData = new FormData();
            formData.set("articleId", articleId);
            run(() => publishKnowledgeArticleAction(formData));
          }}
        >
          Publish
        </button>
      ) : null}
      {status === "PUBLISHED" ? (
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 disabled:opacity-60"
          onClick={() => {
            const formData = new FormData();
            formData.set("articleId", articleId);
            run(() => archiveKnowledgeArticleAction(formData));
          }}
        >
          Archive
        </button>
      ) : null}
      {status === "ARCHIVED" ? (
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 disabled:opacity-60"
          onClick={() => {
            const formData = new FormData();
            formData.set("articleId", articleId);
            run(() => restoreKnowledgeArticleAction(formData));
          }}
        >
          Restore to Draft
        </button>
      ) : null}
    </div>
  );
}

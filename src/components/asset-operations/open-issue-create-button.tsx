"use client";

export function OpenIssueCreateButton() {
  return (
    <button
      type="button"
      className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700"
      data-testid="empty-create-issue"
      onClick={() => {
        const panel = document.getElementById("create-issue");
        if (panel instanceof HTMLDetailsElement) {
          panel.open = true;
        }
        panel?.scrollIntoView({ block: "nearest" });
        panel?.querySelector<HTMLElement>('input[name="summary"]')?.focus();
      }}
    >
      Create Issue
    </button>
  );
}

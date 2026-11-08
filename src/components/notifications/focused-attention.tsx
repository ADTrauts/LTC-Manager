"use client";

import { useEffect } from "react";

/** Scroll the opened item into view. Does not mark it read or acknowledged. */
export function FocusedAttention({ id }: { id: string | null }) {
  useEffect(() => {
    if (!id) return;
    document.getElementById(`attention-item-${id}`)?.scrollIntoView({ block: "center" });
  }, [id]);
  return null;
}

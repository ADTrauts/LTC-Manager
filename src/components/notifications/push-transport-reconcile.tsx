"use client";

import { useEffect } from "react";

import { reconcileBrowserPushSubscription } from "@/lib/notifications/browser-push-client";

/** Releases a leftover personal subscription when this browser’s session is not its owner. */
export function PushTransportReconcile() {
  useEffect(() => {
    void reconcileBrowserPushSubscription();
  }, []);
  return null;
}

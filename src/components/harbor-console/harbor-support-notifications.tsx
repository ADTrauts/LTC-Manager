"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  markAllSupportNotificationsReadAction,
  markSupportNotificationReadAction,
} from "@/app/console/(staff)/tickets/actions";
import { AppIcons } from "@/lib/design-system/icons";
import type { SupportStaffNotificationItem } from "@/lib/support/notifications";

function formatRelativeTime(iso: string): string {
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return "";
  const delta = Math.max(0, Date.now() - created);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function HarborSupportNotifications({
  items,
  unreadCount,
}: {
  items: SupportStaffNotificationItem[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState(items);
  const [unread, setUnread] = useState(unreadCount);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setFeed(items);
    setUnread(unreadCount);
  }, [items, unreadCount]);

  function openTicket(notification: SupportStaffNotificationItem) {
    startTransition(async () => {
      const result = await markSupportNotificationReadAction(notification.id, notification.ticketId);
      setFeed((current) =>
        current.map((row) => (row.id === notification.id ? { ...row, isRead: true } : row)),
      );
      setUnread((count) => (notification.isRead ? count : Math.max(0, count - 1)));
      setOpen(false);
      router.push(result.href);
    });
  }

  function markAll() {
    startTransition(async () => {
      await markAllSupportNotificationsReadAction();
      setFeed((current) => current.map((row) => ({ ...row, isRead: true })));
      setUnread(0);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={unread > 0 ? `Support notifications, ${unread} unread` : "Support notifications"}
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-md p-1 text-[var(--run-aside-fg)] hover:bg-white/10"
      >
        <AppIcons.notifications className="h-5 w-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute bottom-10 left-0 z-20 w-80 rounded-md border border-[var(--border)] bg-white p-2 text-[var(--foreground)] shadow-lg">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-sm font-medium">Support notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                disabled={pending}
                onClick={markAll}
                className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline disabled:opacity-50"
              >
                Mark all as read
              </button>
            ) : null}
          </div>
          {feed.length === 0 ? (
            <p className="px-2 py-4 text-sm text-[var(--text-secondary)]">No notifications yet.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-auto">
              {feed.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/console/tickets/${item.ticketId}`}
                    onClick={(event) => {
                      event.preventDefault();
                      openTicket(item);
                    }}
                    className={`block rounded-md px-2 py-2 text-left text-sm hover:bg-[var(--background)] ${
                      item.isRead ? "opacity-70" : "font-medium"
                    }`}
                  >
                    <span className="block">{item.title}</span>
                    <span className="block text-xs font-normal text-[var(--text-secondary)]">{item.body}</span>
                    <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

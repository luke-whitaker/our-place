"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import NotificationLine from "@/components/NotificationLine";
import { apiFetch, userMessage } from "@/lib/api-client";
import type { NotificationItem } from "@/lib/types";

// Everything that happened to you, newest first. Opening the page marks it all
// read, which clears the navbar's dot; lines that were new stay marked until
// you leave, so you can see which ones they were.
export default function NotificationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ notifications: NotificationItem[] }>("/api/notifications");
        if (cancelled) return;
        setItems(data.notifications);
      } catch (err) {
        if (!cancelled) setError(userMessage(err, "Couldn't load your notifications."));
        return;
      }
      try {
        await apiFetch("/api/notifications/read", { method: "POST" });
      } catch (err) {
        if (!cancelled) setError(userMessage(err, "Couldn't mark these as read. Try again later."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, router]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-ink">Notifications</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Newest first: friend requests, gathering invitations, new times, and cancellations, and
        reactions and comments on your posts, from the last 90 days. Nothing here is ranked.
      </p>

      <div className="op-card mt-6 rounded-2xl border border-line bg-surface px-5 py-2">
        {error && (
          <p role="alert" className="py-3 text-sm text-red-600">
            {error}
          </p>
        )}
        {!error && items === null && (
          <p className="animate-pulse py-3 text-sm text-ink-muted">Loading...</p>
        )}
        {items?.length === 0 && (
          <p className="py-3 text-sm text-ink-muted">
            Nothing yet. When someone reaches out, it shows up here.
          </p>
        )}
        {items && items.length > 0 && (
          <ul>
            {items.map((item) => (
              <NotificationLine key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

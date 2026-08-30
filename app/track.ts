"use client";

// Fire-and-forget funnel beacon. Never throws, never blocks the UI.
export function track(event: string) {
  try {
    void fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never break a user action.
  }
}

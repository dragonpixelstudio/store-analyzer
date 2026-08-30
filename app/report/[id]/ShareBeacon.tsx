"use client";

import { useEffect } from "react";
import { track } from "@/app/track";

// Fires once when a shared report is viewed, and flags the session so that if
// this visitor goes on to analyze their own asset, it counts as a viral-loop
// return. Renders nothing.
export default function ShareBeacon() {
  useEffect(() => {
    track("share_open");
    try {
      sessionStorage.setItem("dpx_saw_shared_report", "1");
    } catch {
      // sessionStorage unavailable; loop attribution is best-effort.
    }
  }, []);
  return null;
}

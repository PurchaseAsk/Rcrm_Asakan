"use client";

import { useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase";

export function RealtimeReconnect() {
  useEffect(() => {
    const supabase = createBrowserSupabase();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        supabase.realtime.connect();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}

"use client";

import { createBrowserClient } from "@supabase/ssr";
import { isConfigured } from "@/lib/config";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!isConfigured(url) || !isConfigured(key)) return null;
  browserClient ??= createBrowserClient(url!, key!);
  return browserClient;
}

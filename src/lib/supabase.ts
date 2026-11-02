// Guardian accounts backend (Phase 6) — Supabase project "guardian-accounts".
// PRIVACY RULE: this backend holds identity + entitlement ONLY (email, display
// name, plan). It NEVER receives GPS, sessions, clients, bookings, ledger or
// vault data — those live on-device in Dexie, exactly as promised publicly.
// The anon key is a public client key by design; row-level security restricts
// every user to their own row.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ulpolxydpfenslyeeynf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscG9seHlkcGZlbnNseWVleW5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwNzA1NzQsImV4cCI6MjA3NzY0NjU3NH0.6LeN3G5VByWVvRchLQL3dBQfgxSnQPNz7X9oOCnFyII";

export const accountsConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!accountsConfigured) return null;
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

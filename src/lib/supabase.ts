// Guardian accounts backend (Phase 6) — Supabase project "guardian-accounts".
// PRIVACY RULE: this backend holds identity + entitlement ONLY (email, display
// name, plan). It NEVER receives GPS, sessions, clients, bookings, ledger or
// vault data — those live on-device in Dexie, exactly as promised publicly.
// The anon key is a public client key by design; row-level security restricts
// every user to their own row.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://gbvukahdkuxpqkocyput.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdidnVrYWhka3V4cHFrb2N5cHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1OTI4OTQsImV4cCI6MjEwOTE2ODg5NH0.QsXt8EF6eziYCW0-XKiAxo9RRWQRkJ3kLV1W-FUfI1s";

export const accountsConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!accountsConfigured) return null;
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

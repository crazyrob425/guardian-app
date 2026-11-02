// Guardian account + entitlement (Phase 6). Magic-link sign-in against the
// guardian-accounts Supabase project; the ONLY data fetched is her own plan.
// Entitlement is cached locally with a 30-day offline grace: a safety app
// never locks anyone out mid-date because a token or a cell signal died.

import { supabase, accountsConfigured } from "./supabase";

export interface MyPlan {
  email: string;
  displayName: string;
  plan: "beta" | "free" | "pro";
  proSource: string;
  proExpiresAt: number | null;
}

const CACHE_K = "guardian.entitlement.v1";
const GRACE_MS = 30 * 24 * 3600 * 1000;

export async function currentEmail(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user?.email ?? null;
}

export async function sendMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  const sb = supabase();
  if (!sb) return { ok: false, error: "Accounts aren't open yet." };
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut(): Promise<void> {
  const sb = supabase();
  if (sb) await sb.auth.signOut();
  try { localStorage.removeItem(CACHE_K); } catch { /* noop */ }
}

/** Fetch (and cache) her plan row, creating it on first sign-in. */
export async function fetchMyPlan(): Promise<MyPlan | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data: sess } = await sb.auth.getSession();
  const user = sess.session?.user;
  if (!user) return null;
  const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data) {
    const fresh = { id: user.id, email: user.email ?? "", display_name: "", plan: "beta" };
    await sb.from("profiles").insert(fresh);
    const plan: MyPlan = { email: fresh.email, displayName: "", plan: "beta", proSource: "", proExpiresAt: null };
    cachePlan(plan);
    return plan;
  }
  const plan: MyPlan = {
    email: data.email ?? user.email ?? "",
    displayName: data.display_name ?? "",
    plan: (data.plan as MyPlan["plan"]) ?? "beta",
    proSource: data.pro_source ?? "",
    proExpiresAt: data.pro_expires_at ? new Date(data.pro_expires_at).getTime() : null,
  };
  cachePlan(plan);
  return plan;
}

function cachePlan(plan: MyPlan) {
  try {
    localStorage.setItem(CACHE_K, JSON.stringify({ plan, fetchedAt: Date.now() }));
  } catch { /* noop */ }
}

export function cachedPlan(): { plan: MyPlan; fresh: boolean } | null {
  try {
    const raw = localStorage.getItem(CACHE_K);
    if (!raw) return null;
    const { plan, fetchedAt } = JSON.parse(raw) as { plan: MyPlan; fetchedAt: number };
    return { plan, fresh: Date.now() - fetchedAt < GRACE_MS };
  } catch {
    return null;
  }
}

/** During beta, beta/free/pro all unlock everything. When Pro launches, this
 *  is the single gate Pro features check. */
export function entitled(): boolean {
  const c = cachedPlan();
  if (!c) return true; // beta: no account required, everything free
  if (c.plan.plan === "beta") return true;
  if (c.plan.plan === "pro") {
    if (!c.plan.proExpiresAt) return true;
    if (Date.now() < c.plan.proExpiresAt) return true;
    return c.fresh; // expired but inside offline grace after a recent check
  }
  return true; // free tier keeps all safety features — safety is never paywalled
}

export { accountsConfigured };

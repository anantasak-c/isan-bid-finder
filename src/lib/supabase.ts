import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey || secretKey.startsWith("sb_publishable_")) {
    client = null;
    return client;
  }
  client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-application-name": "isan-bid-finder" } },
  });
  return client;
}

export function demoDataAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_DEMO_DATA !== "false";
}

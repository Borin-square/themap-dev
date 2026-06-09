import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase: SupabaseClient = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder", {
  auth: { flowType: "implicit" },
});

// Supabase project ref (per costruire le chiavi di storage)
export const supabaseRef = (url.match(/\/\/([^.]+)/) || [])[1] || "";
export const supabaseReady = !!url && !!anonKey;

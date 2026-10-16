import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
let configError = "";
let supabase: SupabaseClient | null = null;
try {
  if (url || key) {
    if (!url || !key)
      throw new Error(
        "Configure as duas variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY na Vercel e faça um novo deploy.",
      );
    let role = "";
    try {
      role = JSON.parse(
        atob(key.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? ""),
      ).role;
    } catch {
      /* Publishable keys do not contain a JWT. */
    }
    if (key.startsWith("sb_secret_") || role === "service_role")
      throw new Error(
        "Uma chave secreta foi configurada no cliente. Remova-a, revogue-a no Supabase e use uma chave pública.",
      );
    if (!["https:", "http:"].includes(new URL(url).protocol))
      throw new Error("URL do Supabase inválida.");
    supabase = createClient(url, key);
  }
} catch (e) {
  configError =
    e instanceof Error ? e.message : "Configuração do Supabase inválida.";
}
export { supabase, configError };

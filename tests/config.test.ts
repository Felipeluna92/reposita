import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe("configuração pública", () => {
  it("permite demo sem banco", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const config = await import("../src/lib/supabase");
    expect(config.supabase).toBeNull();
    expect(config.configError).toBe("");
  });
  it("explica configuração incompleta sem derrubar o aplicativo", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const config = await import("../src/lib/supabase");
    expect(config.supabase).toBeNull();
    expect(config.configError).toContain("duas variáveis");
  });
  it("bloqueia chave secreta moderna", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "sb_secret_not-a-real-key");
    const config = await import("../src/lib/supabase");
    expect(config.supabase).toBeNull();
    expect(config.configError).toContain("chave secreta");
  });
  it("bloqueia service_role JWT legado", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv(
      "VITE_SUPABASE_ANON_KEY",
      "fake." + btoa(JSON.stringify({ role: "service_role" })) + ".fake",
    );
    const config = await import("../src/lib/supabase");
    expect(config.supabase).toBeNull();
    expect(config.configError).toContain("chave secreta");
  });
  it("recusa URL inválida sem tela branca", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "not-a-url");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "sb_publishable_not-a-real-key");
    const config = await import("../src/lib/supabase");
    expect(config.supabase).toBeNull();
    expect(config.configError).not.toBe("");
  });
});

import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { receiveDemand, readiness } from "../server/demand-handler";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ rpc })),
}));
const id = "11111111-1111-4111-8111-111111111111",
  store = "22222222-2222-4222-8222-222222222222";
const payload = () => ({
  id,
  store,
  captcha: "challenge-token",
  website: "",
  input: {
    label: "Café",
    variant: "500 g",
    quantity: 2,
    budget: 25,
    note: "Sem açúcar",
    contact: "",
    contact_consent: false,
  },
});
const req = (body: unknown = payload(), origin = "https://reposita.example") =>
  new Request("https://reposita.example/api/demand", {
    method: "POST",
    headers: {
      origin,
      "Content-Type": "application/json",
      "x-vercel-forwarded-for": "192.0.2.1",
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-test-key");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "server-challenge-key");
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "public-site-key");
  vi.stubEnv("PUBLIC_SITE_URL", "https://reposita.example");
  rpc.mockReset().mockResolvedValue({ data: id, error: null });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            hostname: "reposita.example",
            action: "demand",
          }),
        ),
      ),
    ),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("ingestão pública protegida", () => {
  it("valida respostas extras e não aceita rótulos forjados", async () => {
    expect(
      (
        await receiveDemand(
          req({
            ...payload(),
            input: {
              ...payload().input,
              custom_answers: [{ id: "q_1", value: "x".repeat(241) }],
            },
          }),
        )
      ).status,
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(
      (
        await receiveDemand(
          req({
            ...payload(),
            input: {
              ...payload().input,
              custom_answers: [{ id: "q_1", label: "Forjado", value: "Local" }],
            },
          }),
        )
      ).status,
    ).toBe(201);
    expect(rpc.mock.calls[0][1].p_input.custom_answers).toEqual([
      { id: "q_1", value: "Local" },
    ]);
  });
  it("falha fechada sem credenciais, sem expor segredos", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(await readiness().json()).toEqual({ enabled: false });
    expect((await receiveDemand(req())).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("bloqueia origem diferente, honeypot e contato sem autorização antes de gastar CAPTCHA", async () => {
    expect(
      (await receiveDemand(req(payload(), "https://evil.example"))).status,
    ).toBe(403);
    expect(
      (await receiveDemand(req({ ...payload(), website: "spam" }))).status,
    ).toBe(400);
    expect(
      (
        await receiveDemand(
          req({
            ...payload(),
            input: { ...payload().input, contact: "11999999999" },
          }),
        )
      ).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("limita bytes mesmo sem Content-Length", async () => {
    expect(
      (await receiveDemand(req({ ...payload(), extra: "a".repeat(9000) })))
        .status,
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("exige CAPTCHA válido, hostname e ação esperados", async () => {
    for (const answer of [
      { success: false },
      { success: true, hostname: "evil.example", action: "demand" },
      { success: true, hostname: "reposita.example", action: "login" },
    ]) {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(answer)),
      );
      expect((await receiveDemand(req())).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("ignora proprietário/produto forjados e armazena somente hash do IP", async () => {
    const body = payload();
    const response = await receiveDemand(
      req({
        ...body,
        input: {
          ...body.input,
          user_id: "attacker",
          product_id: "private",
          status: "closed",
        },
      }),
    );
    expect(response.status).toBe(201);
    const args = rpc.mock.calls[0][1];
    expect(args.p_input).toEqual({
      ...body.input,
      product_id: null,
      reason: "missing",
    });
    expect(args.p_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain("192.0.2.1");
    expect(JSON.stringify(args)).not.toContain("attacker");
  });
  it("retorna limitação e conflito sem vazar erro do banco", async () => {
    rpc.mockResolvedValueOnce({
      error: { message: "Limite de solicitações atingido" },
    });
    expect((await receiveDemand(req())).status).toBe(429);
    rpc.mockResolvedValueOnce({
      error: { message: "Seu interesse já foi registrado" },
    });
    expect((await receiveDemand(req())).status).toBe(409);
    rpc.mockResolvedValueOnce({
      error: { message: "secret-internal-table-error" },
    });
    const result = await receiveDemand(req());
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("secret-internal");
  });
  it("não grava quando a verificação externa falha", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("timeout"));
    expect((await receiveDemand(req())).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
});

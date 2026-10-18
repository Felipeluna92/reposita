// @vitest-environment jsdom
import React, { StrictMode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBilling } from "../src/billing/useBilling";
import { billingFixture, response, userId } from "./billing-fixtures";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession } } }));
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  getSession
    .mockReset()
    .mockResolvedValue({
      data: { session: { access_token: "token-1", user: { id: userId } } },
      error: null,
    });
  fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
    response(init.method === "POST" ? { notice: "Feito" } : billingFixture()),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("billing autenticado", () => {
  it("usa bearer atual em cada GET/POST e um UUID novo por ação", async () => {
    const { result } = renderHook(() => useBilling(false, userId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer token-1",
    );
    getSession.mockResolvedValue({
      data: { session: { access_token: "token-2", user: { id: userId } } },
      error: null,
    });
    await act(async () => {
      await result.current.run("sync");
    });
    await act(async () => {
      await result.current.run("portal");
    });
    const posts = fetchMock.mock.calls.filter(
      ([, init]) => init.method === "POST",
    );
    expect(posts).toHaveLength(2);
    const bodies = posts.map(([, init]) => JSON.parse(init.body));
    expect(bodies[0]).toEqual({
      action: "sync",
      request_id: expect.stringMatching(/^[\da-f-]{36}$/i),
    });
    expect(bodies[1].request_id).not.toBe(bodies[0].request_id);
    expect(
      posts.every(
        ([, init]) => init.headers.Authorization === "Bearer token-2",
      ),
    ).toBe(true);
    expect(fetchMock.mock.calls.every(([url]) => url === "/api/billing")).toBe(
      true,
    );
  });

  it("demonstração não lê sessão nem faz rede, mesmo por chamadas diretas", async () => {
    const { result } = renderHook(() => useBilling(true, "demo"));
    await act(async () => {
      await result.current.reload();
    });
    await expect(
      result.current.run("checkout", { plan: "small" }),
    ).rejects.toThrow("conta real");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it.each(["missingmigration", "missingconfig", "PGRST202"])(
    "trata %s como configuração opcional, sem planos fictícios",
    async (error) => {
      fetchMock.mockResolvedValue(response({ error }, 503));
      const { result } = renderHook(() => useBilling(false, userId));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.state?.configured).toBe(false);
      expect(result.current.state?.plans).toEqual([]);
      expect(result.current.state?.owner_setup_needed).toBe(false);
      expect(result.current.error).toBe(error);
    },
  );

  it("recusa sessão de outra conta antes de enviar requisição", async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "outro-token", user: { id: "outro" } } },
      error: null,
    });
    const { result } = renderHook(() => useBilling(false, userId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain("sessão expirou");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exige confirmação para ações destrutivas e bloqueia duplo envio", async () => {
    const { result } = renderHook(() => useBilling(false, userId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.run("disable")).rejects.toThrow("Confirme");
    let finish!: (value: Response) => void;
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      init.method === "POST"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(response(billingFixture())),
    );
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.run("sync");
    });
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    await expect(
      result.current.run("checkout", { plan: "small" }),
    ).rejects.toThrow("Aguarde");
    await act(async () => {
      finish(response({ notice: "Feito" }));
      await pending;
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) => init.method === "POST"),
    ).toHaveLength(1);
  });

  it("descarta GET antigo após refresh", async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useBilling(false, userId));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    await act(async () => {
      await result.current.reload();
    });
    await waitFor(() => expect(result.current.state?.configured).toBe(true));
    if (finish)
      await act(async () => {
        finish(response(billingFixture({ configured: false })));
      });
    expect(result.current.state?.configured).toBe(true);
  });
  it("StrictMode não dispara mutações ao inicializar", async () => {
    const { result } = renderHook(() => useBilling(false, userId), {
      wrapper: StrictMode,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(
      fetchMock.mock.calls.every(([, init]) => init.method === "GET"),
    ).toBe(true);
  });

  it("descarta URL de pagamento pendente depois de sair da conta", async () => {
    const { result, unmount } = renderHook(() => useBilling(false, userId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let finish!: (value: Response) => void;
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      init.method === "POST"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(response(billingFixture())),
    );
    let outcome!: Promise<unknown>;
    act(() => {
      outcome = result.current.run("checkout", { plan: "small" }).then(
        () => "unexpected redirect",
        (error: unknown) => error,
      );
    });
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    unmount();
    finish(response({ url: "https://checkout.stripe.com/test" }));
    expect(await outcome).toMatchObject({ name: "AbortError" });
  });
});

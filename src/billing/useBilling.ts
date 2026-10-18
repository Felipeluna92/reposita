import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type {
  BillingAction,
  BillingActionInput,
  BillingActionResult,
  BillingState,
} from "./types";

const configurationError =
  /missing[\s_-]*(?:config|migration)|PGRST20[025]|42P01|atualiza[çc][ãa]o.*(?:assinaturas|SQL)|assinaturas.*(?:incompleta|configura[çc][ãa]o)/i;

function unconfigured(): BillingState {
  return {
    configured: false,
    setup_required: false,
    stripe_ready: false,
    owner_setup_needed: false,
    plans: [],
    settings: {
      enabled: false,
      mode: "test",
      trial_days: 7,
      trial_products: 50,
      support_email: "",
    },
  };
}

function readState(value: unknown): BillingState {
  if (!value || typeof value !== "object")
    throw new Error("Resposta de assinaturas inválida.");
  const state = ("state" in value ? value.state : value) as BillingState;
  if (
    !state ||
    typeof state.configured !== "boolean" ||
    !Array.isArray(state.plans) ||
    !state.settings ||
    typeof state.settings.enabled !== "boolean" ||
    !["test", "live"].includes(state.settings.mode)
  )
    throw new Error("Resposta de assinaturas inválida.");
  return state;
}

export function useBilling(demo: boolean, userId: string) {
  const [state, setState] = useState<BillingState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const lock = useRef(false);
  const mounted = useRef(true);
  const getController = useRef<AbortController | null>(null);
  const identity = `${demo}:${userId}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;

  const request = useCallback(
    async (
      action?: BillingAction,
      input?: BillingActionInput,
      signal?: AbortSignal,
    ) => {
      if (demo)
        throw new Error("Use uma conta real para gerenciar assinaturas.");
      if (!supabase) throw new Error("Entre na sua conta para continuar.");
      // Read the session for every request; never cache a bearer token or trust URL customer IDs.
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);
      if (!data.session?.access_token || data.session.user.id !== userId) {
        throw new Error("Sua sessão expirou. Entre novamente.");
      }
      if (currentIdentity.current !== `${demo}:${userId}`)
        throw new DOMException("Conta alterada", "AbortError");
      if (signal?.aborted)
        throw new DOMException("Consulta cancelada", "AbortError");
      const response = await fetch("/api/billing", {
        method: action ? "POST" : "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
          ...(action ? { "Content-Type": "application/json" } : {}),
        },
        ...(action
          ? {
              body: JSON.stringify({
                ...input,
                action,
                request_id: crypto.randomUUID(),
              }),
            }
          : {}),
      });
      const body: unknown = await response.json();
      const failure =
        body && typeof body === "object" && "error" in body ? body.error : null;
      if (!response.ok || failure) {
        throw new Error(
          typeof failure === "string"
            ? failure
            : "Não foi possível consultar as assinaturas. Tente novamente.",
        );
      }
      return body;
    },
    [demo, userId],
  );

  const reload = useCallback(async () => {
    if (demo) return;
    const current = ++sequence.current;
    getController.current?.abort();
    const controller = new AbortController();
    getController.current = controller;
    if (mounted.current) {
      setLoading(true);
      setError("");
    }
    try {
      const next = readState(
        await request(undefined, undefined, controller.signal),
      );
      if (mounted.current && current === sequence.current) setState(next);
    } catch (cause) {
      if (
        !mounted.current ||
        current !== sequence.current ||
        controller.signal.aborted
      )
        return;
      const message =
        cause instanceof Error
          ? cause.message
          : "Assinaturas indisponíveis. Tente novamente.";
      setError(message);
      // Billing migrations are additive: their absence must not disable the existing inventory.
      if (configurationError.test(message))
        setState((previous) =>
          previous?.configured ? previous : unconfigured(),
        );
    } finally {
      if (mounted.current && current === sequence.current) setLoading(false);
    }
  }, [demo, request]);

  useEffect(() => {
    mounted.current = true;
    setState(null);
    setError("");
    setLoading(!demo);
    if (!demo) void reload();
    return () => {
      mounted.current = false;
      sequence.current++;
      getController.current?.abort();
    };
  }, [demo, reload]);

  const run = useCallback(
    async (
      action: BillingAction,
      input?: BillingActionInput,
    ): Promise<BillingActionResult> => {
      if (demo)
        throw new Error("Use uma conta real para gerenciar assinaturas.");
      if (lock.current)
        throw new Error("Aguarde a operação de assinatura terminar.");
      if (
        (action === "change" || action === "enable" || action === "disable") &&
        input?.confirm !== true
      ) {
        throw new Error("Confirme esta ação antes de continuar.");
      }
      lock.current = true;
      sequence.current++;
      getController.current?.abort();
      if (mounted.current) {
        setBusy(true);
        setLoading(false);
        setError("");
      }
      try {
        const body = await request(action, input);
        if (
          !mounted.current ||
          currentIdentity.current !== `${demo}:${userId}`
        ) {
          throw new DOMException(
            "Conta alterada ou desconectada",
            "AbortError",
          );
        }
        if (!body || typeof body !== "object")
          throw new Error("Resposta de assinatura inválida.");
        const result = body as BillingActionResult;
        if (result.url !== undefined && typeof result.url !== "string")
          throw new Error("URL de pagamento inválida.");
        if (
          !result.url &&
          mounted.current &&
          currentIdentity.current === `${demo}:${userId}`
        )
          await reload();
        if (
          !mounted.current ||
          currentIdentity.current !== `${demo}:${userId}`
        ) {
          throw new DOMException(
            "Conta alterada ou desconectada",
            "AbortError",
          );
        }
        return result;
      } catch (cause) {
        if (
          mounted.current &&
          currentIdentity.current === `${demo}:${userId}`
        ) {
          const message =
            cause instanceof Error
              ? cause.message
              : "Não foi possível concluir a operação.";
          setError(message);
          if (configurationError.test(message))
            setState((previous) =>
              previous?.configured ? previous : unconfigured(),
            );
        }
        throw cause;
      } finally {
        lock.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [demo, userId, request, reload],
  );

  // Refresh at the access deadline; read/export remain independent of billing loading/errors.
  const deadline =
    state?.access?.status === "trial"
      ? state.access.trial_ends_at
      : state?.access?.period_end;
  useEffect(() => {
    if (demo || !state?.settings.enabled || !deadline || state.access?.is_owner)
      return;
    const delay = Date.parse(deadline) - Date.now();
    if (!Number.isFinite(delay) || delay < 0) return;
    const timer = window.setTimeout(
      () => void reload(),
      Math.min(delay + 100, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [
    demo,
    state?.settings.enabled,
    state?.access?.is_owner,
    deadline,
    reload,
  ]);

  return { state, error, loading, busy, reload, run };
}

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { blankDemand } from "./DemandFields";
import { Turnstile } from "./Turnstile";
import { readDemandDemo, submitDemoDemand } from "./repository";
import { validateDemand } from "./logic";
import { pageSettings } from "./page-settings";
import { StorePageView } from "./StorePageView";
import {
  PublicPageFields,
  publicInput,
  validatePublicFields,
} from "./PublicPageFields";
import type { PublicStore } from "./types";
import "./store-page.css";
export function PublicDemand({ token }: { token: string }) {
  const demo = token === "demo";
  const [store, setStore] = useState<PublicStore | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [ready, setReady] = useState(demo),
    [success, setSuccess] = useState(false),
    [busy, setBusy] = useState(false);
  const [value, setValue] = useState({ ...blankDemand }),
    [captcha, setCaptcha] = useState(""),
    [reset, setReset] = useState(0),
    [trap, setTrap] = useState(""),
    [id, setId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    async function load() {
      try {
        let next: PublicStore | null;
        if (demo) next = readDemandDemo().store;
        else {
          if (!supabase || !/^[0-9a-f-]{36}$/i.test(token))
            throw new Error(
              "Página indisponível. Solicite um link atualizado à loja.",
            );
          const [result, response] = await Promise.all([
            supabase.rpc("reposita_public_store_info", { p_token: token }),
            fetch("/api/demand", { signal: controller.signal }),
          ]);
          if (result.error)
            throw new Error("Não foi possível abrir a página desta loja.");
          next = result.data;
          const data = response.ok ? await response.json() : null;
          if (alive)
            setReady(
              !!data?.enabled && !!import.meta.env.VITE_TURNSTILE_SITE_KEY,
            );
        }
        if (!next?.enabled)
          throw new Error(
            "Esta página está desativada. Solicite um link atualizado à loja.",
          );
        if (alive) setStore(next);
      } catch (e) {
        if (alive && !controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [token, demo]);
  if (loading)
    return (
      <main className="loading" role="status">
        Abrindo página da loja…
      </main>
    );
  if (!store)
    return (
      <main className="loading">
        <section className="panel" role="alert">
          <h1>Não foi possível abrir esta página</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  const settings = pageSettings(store.page_settings);
  return (
    <main>
      <StorePageView name={store.name} settings={settings}>
        {success ? (
          <div className="demand-empty">
            <CheckCircle2 size={42} />
            <h2>{settings.success_title}</h2>
            <p>{settings.success_message}</p>
            <p>
              {value.contact_consent && value.contact
                ? "A loja poderá retornar sobre este pedido pelo contato autorizado."
                : "A loja recebeu sua solicitação sem dados de contato."}
            </p>
            <button
              className="secondary"
              onClick={() => {
                setSuccess(false);
                setValue({ ...blankDemand });
                setId(crypto.randomUUID());
                setCaptcha("");
                setReset((n) => n + 1);
              }}
            >
              Solicitar outro produto
            </button>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setError("");
              setBusy(true);
              try {
                const input = publicInput(value, settings);
                validateDemand(input);
                validatePublicFields(input, settings);
                if (demo) await submitDemoDemand(input, id);
                else {
                  if (!ready || !captcha)
                    throw new Error(
                      "Conclua a verificação de segurança antes de enviar.",
                    );
                  const response = await fetch("/api/demand", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id,
                      store: token,
                      input,
                      captcha,
                      website: trap,
                    }),
                    signal: AbortSignal.timeout(15000),
                  });
                  const result = await response.json();
                  if (!response.ok)
                    throw new Error(
                      result.error ??
                        "Não foi possível enviar. Tente novamente.",
                    );
                }
                setSuccess(true);
              } catch (e) {
                setError((e as Error).message);
                setCaptcha("");
                setReset((n) => n + 1);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>{settings.form_title}</h2>
            {settings.form_description && <p>{settings.form_description}</p>}
            {demo && (
              <p className="demo-banner">
                Demonstração: este pedido ficará somente neste navegador.
              </p>
            )}
            <PublicPageFields
              value={value}
              onChange={setValue}
              settings={settings}
            />
            <div className="honeypot" aria-hidden="true">
              <label>
                Seu site
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={trap}
                  onChange={(e) => setTrap(e.target.value)}
                />
              </label>
            </div>
            {!demo &&
              (ready ? (
                <Turnstile onToken={setCaptcha} reset={reset} />
              ) : (
                <p className="error">
                  O recebimento está temporariamente indisponível. Fale
                  diretamente com a loja.
                </p>
              ))}
            <p className="store-privacy">
              Os dados serão usados por {store.name} para avaliar esta
              solicitação. Se você autorizar um retorno, a loja usará o contato
              apenas para este pedido. Para excluir o contato ou interromper o
              retorno, avise a loja pelo mesmo canal. Não é uma inscrição em
              campanhas.
            </p>
            {settings.privacy_note && (
              <p className="store-privacy">{settings.privacy_note}</p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary"
              disabled={busy || !ready || (!demo && !captcha)}
            >
              {busy ? "Enviando…" : settings.button}
            </button>
          </form>
        )}
      </StorePageView>
    </main>
  );
}

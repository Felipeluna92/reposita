import { useState, type FormEvent } from "react";
import { supabase, configError } from "../lib/supabase";
export function Auth({ demo }: { demo: () => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (!supabase)
        throw new Error("Supabase ainda não configurado. Use a demonstração.");
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMessage(
          "Se o e-mail estiver cadastrado, enviaremos um link para redefinir sua senha.",
        );
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session)
          setMessage("Confira seu e-mail para confirmar o cadastro.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-story">
        <a className="brand" href="#">
          <b>r.</b>reposita
        </a>
        <span className="eyebrow">MENOS ACHISMO. MAIS RESULTADO.</span>
        <h1>
          Seu estoque pode
          <br />
          trabalhar melhor
          <br />
          <em>por você.</em>
        </h1>
        <p>
          Produtos, reposição e preços em um só lugar.
          <br />
          Para negócios de todos os tamanhos e segmentos.
        </p>
        <div className="auth-features">
          <span>01 · Controle o que entra e sai</span>
          <span>02 · Encontre seu preço de venda</span>
          <span>03 · Decida o que repor</span>
        </div>
      </div>
      <section className="auth-card">
        <span className="eyebrow">BEM-VINDO AO REPOSITA</span>
        <h2>
          {mode === "signup"
            ? "Crie sua conta"
            : mode === "reset"
              ? "Recupere seu acesso"
              : "Vamos cuidar do seu negócio?"}
        </h2>
        <p>Seus dados ficam separados dos dados de outros usuários.</p>
        {supabase ? (
          <form onSubmit={submit}>
            <label>
              E-mail
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {mode !== "reset" && (
              <label>
                Senha
                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {message && <p role="status">{message}</p>}
            <button className="primary" disabled={busy}>
              {busy
                ? "Aguarde…"
                : mode === "signup"
                  ? "Criar conta"
                  : mode === "reset"
                    ? "Enviar link"
                    : "Entrar na conta"}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setMode(mode === "signup" ? "login" : "signup");
                setError("");
                setMessage("");
              }}
            >
              {mode === "signup" ? "Já tenho conta" : "Ainda não tenho conta"}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setMode(mode === "reset" ? "login" : "reset");
                setError("");
                setMessage("");
              }}
            >
              {mode === "reset" ? "Voltar ao login" : "Esqueci a senha"}
            </button>
          </form>
        ) : (
          <div className="notice">
            {configError && <p role="alert">{configError}</p>}O banco ainda não
            está conectado. O modo demonstração funciona neste navegador, sem
            dados compartilhados.
          </div>
        )}
        <button className="secondary full" onClick={demo} disabled={busy}>
          Explorar demonstração
        </button>
        <p className="fine-print">
          Na demonstração, os dados são locais e não migram automaticamente para
          a conta.
        </p>
      </section>
    </main>
  );
}

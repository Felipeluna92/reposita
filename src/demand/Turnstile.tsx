import { useEffect, useRef, useState } from "react";
type Widget = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Widget;
  }
}
export function Turnstile({
  onToken,
  reset,
}: {
  onToken: (value: string) => void;
  reset: number;
}) {
  const ref = useRef<HTMLDivElement>(null),
    callback = useRef(onToken);
  callback.current = onToken;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    let id: string | undefined;
    let alive = true;
    function mount() {
      if (!alive || !ref.current || id !== undefined || !window.turnstile)
        return;
      id = window.turnstile.render(ref.current, {
        sitekey,
        action: "demand",
        size: "flexible",
        callback: (token: string) => {
          setFailed(false);
          callback.current(token);
        },
        "expired-callback": () => callback.current(""),
        "error-callback": () => {
          callback.current("");
          setFailed(true);
        },
      });
    }
    if (!sitekey) {
      setFailed(true);
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(
      "script[data-reposita-turnstile]",
    );
    if (!script) {
      script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.repositaTurnstile = "true";
      document.head.appendChild(script);
    }
    const fail = () => {
      if (alive) setFailed(true);
    };
    script.addEventListener("load", mount);
    script.addEventListener("error", fail);
    mount();
    return () => {
      alive = false;
      script.removeEventListener("load", mount);
      script.removeEventListener("error", fail);
      if (id !== undefined) window.turnstile?.remove(id);
    };
  }, [reset]);
  return (
    <div>
      <div ref={ref} />
      {failed && (
        <p className="error" role="alert">
          A verificação de segurança não carregou. Recarregue a página e
          verifique se o navegador permite Cloudflare Turnstile.
        </p>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Dialog } from "../components/Dialog";
import type { useDemand } from "./useDemand";
export function StoreSharing({
  demo,
  model,
  name,
  close,
}: {
  demo: boolean;
  model: ReturnType<typeof useDemand>;
  name: string;
  close: () => void;
}) {
  const [title, setTitle] = useState(model.store?.name ?? name),
    [enabled, setEnabled] = useState(model.store?.enabled ?? false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [qr, setQr] = useState(""),
    [ready, setReady] = useState(demo);
  const url = model.store?.enabled
    ? window.location.origin +
      "/?procura=" +
      (demo ? "demo" : model.store.public_token)
    : "";
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    fetch("/api/demand", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setReady(!!data?.enabled))
      .catch(() => {});
    return () => controller.abort();
  }, [demo]);
  useEffect(() => {
    let alive = true;
    setQr("");
    if (url)
      void import("qrcode")
        .then(({ default: QRCode }) =>
          QRCode.toDataURL(url, {
            width: 240,
            margin: 2,
            color: { dark: "#123c31", light: "#ffffff" },
          }),
        )
        .then((image) => {
          if (alive) setQr(image);
        })
        .catch(() => {
          if (alive)
            setError(
              "Não foi possível gerar o QR Code. O link continua disponível.",
            );
        });
    return () => {
      alive = false;
    };
  }, [url]);
  async function save(rotate = false) {
    setError("");
    setNotice("");
    try {
      await model.saveStore(title, enabled, rotate);
      setNotice(
        rotate
          ? "Novo link criado. O anterior foi desativado."
          : "Página da loja atualizada.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Dialog
      title="Um link para ouvir seus clientes"
      close={close}
      busy={model.busy}
    >
      <p>
        Compartilhe no balcão, no WhatsApp ou na bio. A página recebe
        solicitações; não publica estoque, preços de custo ou dados do painel.
      </p>
      {demo ? (
        <p className="demo-banner">
          Demonstração local: o link funciona apenas neste navegador, sem envio
          de dados ao banco.
        </p>
      ) : (
        !ready && (
          <p className="upgrade-banner">
            Para receber pela internet, configure Turnstile e as variáveis do
            endpoint na Vercel. Veja as instruções no README do repositório. O
            recebimento fica bloqueado até essa configuração.
          </p>
        )
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          Nome público da loja
          <input
            required
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="consent-line">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!ready && !enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>Ativar página pública de procura</span>
        </label>
        <button className="primary" disabled={model.busy}>
          {model.busy ? "Salvando…" : "Salvar página da loja"}
        </button>
      </form>
      {url && (
        <div className="share-preview">
          {qr && (
            <img
              src={qr}
              width={240}
              height={240}
              alt="QR Code da página de procura da loja"
            />
          )}
          <label>
            Link público
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
          </label>
          <div className="actions">
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setNotice("Link copiado.");
                } catch {
                  setError("Selecione o link acima e copie manualmente.");
                }
              }}
            >
              <Copy size={15} />
              Copiar link
            </button>
            <a
              className="secondary"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={15} />
              Abrir página
            </a>
            {qr && (
              <a
                className="text-button"
                href={qr}
                download="reposita-procura-qr.png"
              >
                Baixar QR Code
              </a>
            )}
          </div>
          <button
            className="text-button"
            disabled={model.busy}
            onClick={() => void save(true)}
          >
            Gerar outro link e invalidar o anterior
          </button>
        </div>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

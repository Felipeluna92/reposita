import type { CSSProperties, ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import type { PageSettings } from "./page-settings";
import { buttonText } from "./page-settings";
import { publicPageImage } from "./page-images";
export function StorePageView({
  name,
  settings,
  children,
  preview = false,
}: {
  name: string;
  settings: PageSettings;
  children: ReactNode;
  preview?: boolean;
}) {
  const s = settings;
  const style = {
    "--page-bg": s.background,
    "--page-surface": s.surface,
    "--page-text": s.text,
    "--page-primary": s.primary,
    "--page-button-text": buttonText(s.primary),
    "--page-font":
      s.font === "elegant"
        ? "Georgia, serif"
        : s.font === "modern"
          ? "Arial, sans-serif"
          : '"DM Sans", sans-serif',
  } as CSSProperties;
  const logo = publicPageImage(s.logo_path),
    cover = publicPageImage(s.cover_path);
  return (
    <div
      className={
        "store-page " +
        (s.layout === "centered" ? "store-centered" : "store-split") +
        (preview ? " is-preview" : "")
      }
      style={style}
      data-theme={s.theme}
    >
      <header className="store-header">
        <div className="store-brand">
          {logo ? (
            <img src={logo} alt={"Logo de " + name} />
          ) : (
            <b>{name.trim().slice(0, 1).toUpperCase() || "r."}</b>
          )}
          <span>{name}</span>
        </div>
        <small>Sugestões da comunidade</small>
      </header>
      <div className="store-layout">
        <section className="store-intro">
          {s.eyebrow && <span className="store-eyebrow">{s.eyebrow}</span>}
          <h1>{s.headline.split("{loja}").join(name)}</h1>
          {s.description && (
            <p className="store-description">{s.description}</p>
          )}
          {cover && (
            <img
              className="store-cover"
              src={cover}
              alt={"Imagem de apresentação de " + name}
            />
          )}
          <div className="store-assurance">
            <MessageCircle size={23} />
            <span>
              Sem cadastro. Contato opcional.
              <br />
              Esta solicitação não é uma compra ou reserva.
            </span>
          </div>
        </section>
        <section className="store-form-card">{children}</section>
      </div>
      {s.footer && <footer className="store-footer">{s.footer}</footer>}
    </div>
  );
}

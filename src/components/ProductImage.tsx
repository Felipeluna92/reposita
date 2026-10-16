import { useEffect, useState } from "react";
import { ImageOff, Package } from "lucide-react";
import { imageUrl } from "../lib/images";
export function ProductImage({
  path,
  name,
  large = false,
  interactive = true,
}: {
  path?: string | null;
  name: string;
  large?: boolean;
  interactive?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setUrl("");
    setFailed(false);
    async function load(refresh = false) {
      if (!path) return;
      try {
        const result = await imageUrl(path, refresh);
        if (alive) {
          setUrl(result);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    }
    void load(attempt > 0);
    const timer = window.setInterval(() => {
      void load(true);
    }, 45 * 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [path, attempt]);
  return (
    <div className={`product-image ${large ? "large" : ""}`}>
      {path && failed ? (
        interactive ? (
          <button
            type="button"
            className="icon-button"
            title="Tentar carregar foto novamente"
            aria-label={`Recarregar foto de ${name}`}
            onClick={() => setAttempt(attempt + 1)}
          >
            <ImageOff size={large ? 32 : 18} />
          </button>
        ) : (
          <span role="img" aria-label="Foto indisponível">
            <ImageOff size={32} />
          </span>
        )
      ) : url ? (
        <img
          src={url}
          alt={`Foto de ${name}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package size={large ? 40 : 20} />
      )}
    </div>
  );
}

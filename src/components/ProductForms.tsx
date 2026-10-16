import { useEffect, useState, type FormEvent } from "react";
import type { Movement, MovementKind, Product, ProductInput } from "../types";
import { kindLabels, validateProduct } from "../lib/inventory";
import { Dialog } from "./Dialog";
import { ProductImage } from "./ProductImage";
import { storeImage, validateImage } from "../lib/images";
import { ImagePlus, Trash2 } from "lucide-react";
export function ProductForm({
  product,
  close,
  save,
  demo = false,
}: {
  product?: Product;
  close: () => void;
  save: (input: ProductInput, id?: string) => Promise<void>;
  demo?: boolean;
}) {
  const [input, setInput] = useState<ProductInput>({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    category: product?.category ?? "",
    initial_stock: 0,
    min_stock: product?.min_stock ?? 5,
    cost: product?.cost ?? 0,
    price: product?.price ?? 0,
    description: product?.description ?? "",
    barcode: product?.barcode ?? "",
    supplier: product?.supplier ?? "",
    location: product?.location ?? "",
    image_path: product?.image_path ?? null,
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [uploaded, setUploaded] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      validateProduct(input);
      let path = input.image_path;
      if (photo) {
        path = uploaded ?? (await storeImage(demo, photo));
        setUploaded(path);
      }
      await save({ ...input, image_path: path }, product?.id);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={product ? "Editar produto" : "Adicionar produto"}
      close={close}
      busy={busy}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <div className="photo-uploader">
            {preview ? (
              <img
                className="upload-preview"
                src={preview}
                alt="Prévia da foto escolhida"
              />
            ) : (
              <ProductImage
                path={input.image_path}
                name={input.name || "produto"}
                large
              />
            )}
            <div>
              <label className="secondary file-button">
                <ImagePlus size={16} />
                Adicionar imagem
                <input
                  type="file"
                  aria-label="Foto do produto"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      validateImage(file);
                      setPhoto(file);
                      setUploaded(null);
                      setError("");
                    } catch (error) {
                      setError((error as Error).message);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              <small>
                JPG, PNG ou WebP · até 5 MB
                <br />
                Otimização automática e acesso privado.
              </small>
              {(photo || input.image_path) && (
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() => {
                    setPhoto(null);
                    setUploaded(null);
                    setInput({ ...input, image_path: null });
                  }}
                >
                  <Trash2 size={14} />
                  Remover foto
                </button>
              )}
            </div>
          </div>
          <label>
            Nome do produto
            <input
              autoFocus
              required
              maxLength={160}
              value={input.name}
              onChange={(e) => setInput({ ...input, name: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              Código SKU
              <input
                maxLength={60}
                value={input.sku}
                onChange={(e) => setInput({ ...input, sku: e.target.value })}
              />
            </label>
            <label>
              Categoria
              <input
                maxLength={80}
                value={input.category}
                onChange={(e) =>
                  setInput({ ...input, category: e.target.value })
                }
              />
            </label>
            {(
              [
                "cost",
                "price",
                "min_stock",
                ...(!product ? ["initial_stock"] : []),
              ] as ("cost" | "price" | "min_stock" | "initial_stock")[]
            ).map((key) => (
              <label key={key}>
                {
                  {
                    cost: "Custo unitário (R$)",
                    price: "Preço de venda (R$)",
                    min_stock: "Estoque mínimo",
                    initial_stock: "Estoque inicial",
                  }[key]
                }
                <input
                  type="number"
                  required
                  min="0"
                  step={key.includes("stock") ? "1" : "0.01"}
                  value={input[key]}
                  onChange={(e) =>
                    setInput({ ...input, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <details className="advanced-fields">
            <summary>Mais informações do produto</summary>
            <div className="form-grid">
              <label>
                Código de barras
                <input
                  maxLength={80}
                  value={input.barcode}
                  onChange={(e) =>
                    setInput({ ...input, barcode: e.target.value })
                  }
                />
              </label>
              <label>
                Fornecedor
                <input
                  maxLength={160}
                  value={input.supplier}
                  onChange={(e) =>
                    setInput({ ...input, supplier: e.target.value })
                  }
                />
              </label>
              <label>
                Localização no estoque
                <input
                  maxLength={160}
                  value={input.location}
                  onChange={(e) =>
                    setInput({ ...input, location: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Descrição
              <textarea
                maxLength={2000}
                value={input.description}
                onChange={(e) =>
                  setInput({ ...input, description: e.target.value })
                }
              />
            </label>
          </details>
          {product && (
            <p className="fine-print">
              Para alterar o saldo, registre uma movimentação. O histórico será
              preservado.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={close}
            >
              Cancelar
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar produto"}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
export function MovementForm({
  products,
  close,
  save,
  initialProduct,
  initialKind = "purchase",
}: {
  products: Product[];
  close: () => void;
  save: (movement: Movement) => Promise<void>;
  initialProduct?: string;
  initialKind?: MovementKind;
}) {
  const [productId, setProductId] = useState(
    initialProduct ?? products[0]?.id ?? "",
  );
  const [kind, setKind] = useState<MovementKind>(initialKind);
  const product = products.find((p) => p.id === productId)!;
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(product?.price ?? 0);
  const [cost, setCost] = useState(product?.cost ?? 0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await save({
        id: requestId,
        product_id: productId,
        kind,
        quantity,
        unit_cost: cost,
        unit_price: price,
        note,
        created_at: new Date().toISOString(),
      });
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Registrar movimentação" close={close} busy={busy}>
      <form onSubmit={submit}>
        <label>
          Produto
          <select
            value={productId}
            onChange={(e) => {
              const p = products.find((p) => p.id === e.target.value)!;
              setProductId(p.id);
              setCost(p.cost);
              setPrice(p.price);
            }}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.stock} un.
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as MovementKind)}
          >
            {Object.entries(kindLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Quantidade
            <input
              required
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
          <label>
            Custo unitário registrado (R$)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(Number(e.target.value))}
            />
          </label>
          {kind === "sale" && (
            <label>
              Preço vendido por unidade (R$)
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </label>
          )}
        </div>
        <label>
          Observação
          <textarea
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <p className="fine-print">
          O custo fica registrado nesta movimentação. Compras não recalculam
          automaticamente o custo médio do cadastro.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={close}
          >
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Registrando…" : "Registrar"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

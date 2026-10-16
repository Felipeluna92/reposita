import { supabase } from "./supabase";
const bucket = "reposita-products";
const cache = new Map<string, { url: string; expires: number }>();
export function validateImage(file: Pick<File, "type" | "size">) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Use uma imagem JPG, PNG ou WebP.");
  if (file.size <= 0 || file.size > 5 * 1024 * 1024)
    throw new Error("A imagem deve ter até 5 MB.");
}
export async function prepareImage(file: File): Promise<Blob> {
  validateImage(file);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      img.src = url;
    });
    if (
      !img.naturalWidth ||
      !img.naturalHeight ||
      img.naturalWidth * img.naturalHeight > 80_000_000
    )
      throw new Error("Resolução de imagem inválida ou muito alta.");
    const scale = Math.min(
      1,
      1200 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Seu navegador não suporta preparação de imagens.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Não foi possível otimizar a imagem.")),
        "image/webp",
        0.82,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function storeImage(demo: boolean, file: File) {
  if (!demo) {
    const { error } = await supabase!
      .from("reposita_products")
      .select("image_path")
      .limit(1);
    if (error)
      throw new Error(
        "Execute a atualização SQL 202610160002_professional.sql no Supabase para ativar fotos e campos avançados.",
      );
  }
  const blob = await prepareImage(file);
  if (demo) {
    if (blob.size > 600_000)
      throw new Error(
        "No modo demo, escolha uma imagem menor (até 600 KB após otimização).",
      );
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Erro ao preparar a imagem."));
      reader.readAsDataURL(blob);
    });
  }
  const { data, error } = await supabase!.auth.getUser();
  if (error || !data.user)
    throw new Error("Faça login novamente para enviar a foto.");
  const extension = blob.type === "image/webp" ? "webp" : "png";
  const path = `${data.user.id}/${crypto.randomUUID()}.${extension}`;
  const result = await supabase!.storage.from(bucket).upload(path, blob, {
    contentType: blob.type,
    upsert: false,
    cacheControl: "3600",
  });
  if (result.error)
    throw new Error(
      "Não foi possível enviar a foto. Confira a migration de Storage e suas permissões: " +
        result.error.message,
    );
  return path;
}
export async function imageUrl(path: string, refresh = false) {
  if (/^data:image\/(png|jpeg|webp);base64,/.test(path)) return path;
  if (
    !supabase ||
    !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(webp|png|jpe?g)$/i.test(path)
  )
    throw new Error("Referência de foto inválida.");
  const stored = cache.get(path);
  if (!refresh && stored && stored.expires > Date.now()) return stored.url;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600);
  if (error) throw new Error("Não foi possível carregar a foto.");
  cache.set(path, { url: data.signedUrl, expires: Date.now() + 45 * 60_000 });
  return data.signedUrl;
}
export function clearImageCache() {
  cache.clear();
}

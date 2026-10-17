import { supabase } from "../lib/supabase";
import { prepareImage } from "../lib/images";
export function publicPageImage(path: string) {
  if (!path) return "";
  if (/^data:image\/(png|jpeg|webp);base64,/.test(path)) return path;
  return (
    supabase?.storage.from("reposita-store-pages").getPublicUrl(path).data
      .publicUrl ?? ""
  );
}
export async function uploadPageImage(demo: boolean, file: File) {
  const blob = await prepareImage(file);
  if (blob.size > 600000)
    throw new Error(
      "Escolha uma imagem menor (até 600 KB depois da otimização).",
    );
  if (demo)
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error("Não foi possível ler a imagem."));
      reader.readAsDataURL(blob);
    });
  const { data, error } = await supabase!.auth.getUser();
  if (error || !data.user) throw new Error("Faça login novamente.");
  const path =
    data.user.id +
    "/" +
    crypto.randomUUID() +
    "." +
    (blob.type === "image/webp" ? "webp" : "png");
  const result = await supabase!.storage
    .from("reposita-store-pages")
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (result.error)
    throw new Error(
      "Não foi possível enviar. Aplique a atualização 202610170004_store_pages.sql no Supabase e tente novamente.",
    );
  return path;
}

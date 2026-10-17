import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { validateDemand } from "../src/demand/logic.js";
import type { DemandInput } from "../src/demand/types";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function configuration() {
  const url = process.env.VITE_SUPABASE_URL?.trim(),
    key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    secret = process.env.TURNSTILE_SECRET_KEY?.trim(),
    site = process.env.PUBLIC_SITE_URL?.trim();
  if (!url || !key || !secret || !site || !process.env.VITE_TURNSTILE_SITE_KEY)
    return null;
  try {
    const origin = new URL(site);
    if (origin.protocol !== "https:" || new URL(url).protocol !== "https:")
      return null;
    return {
      url,
      key,
      secret,
      origin: origin.origin,
      hostname: origin.hostname,
    };
  } catch {
    return null;
  }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function readiness() {
  return json({ enabled: !!configuration() });
}
async function limitedJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("Formato inválido.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Solicitação vazia.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 8192) {
        await reader.cancel();
        throw new Error("Solicitação muito longa.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Solicitação inválida.");
  return parsed;
}
export async function receiveDemand(request: Request) {
  const config = configuration();
  if (!config)
    return json(
      { error: "O recebimento de solicitações ainda não está configurado." },
      503,
    );
  if (request.headers.get("origin") !== config.origin)
    return json({ error: "Origem não autorizada." }, 403);
  let body: Record<string, unknown>, input: DemandInput;
  try {
    body = await limitedJson(request);
    if (
      typeof body.id !== "string" ||
      !uuid.test(body.id) ||
      typeof body.store !== "string" ||
      !uuid.test(body.store) ||
      typeof body.captcha !== "string" ||
      !body.captcha ||
      body.captcha.length > 2048 ||
      body.website
    )
      throw new Error("Solicitação inválida.");
    const v = body.input as Record<string, unknown>;
    if (
      !v ||
      typeof v !== "object" ||
      typeof v.label !== "string" ||
      typeof v.variant !== "string" ||
      typeof v.note !== "string" ||
      typeof v.contact !== "string" ||
      typeof v.contact_consent !== "boolean" ||
      typeof v.quantity !== "number" ||
      (v.budget !== null && typeof v.budget !== "number")
    )
      throw new Error("Confira os campos da solicitação.");
    input = {
      label: v.label.trim(),
      variant: v.variant.trim(),
      note: v.note.trim(),
      contact: v.contact.trim(),
      contact_consent: v.contact_consent,
      quantity: v.quantity,
      budget: v.budget as number | null,
      product_id: null,
      reason: "missing",
    };
    validateDemand(input);
  } catch (e) {
    return json(
      {
        error:
          e instanceof SyntaxError
            ? "Solicitação inválida."
            : (e as Error).message,
      },
      400,
    );
  }
  // On Vercel this header is set by the platform, not trusted from form data.
  const address = request.headers
    .get("x-vercel-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  if (!address)
    return json(
      {
        error:
          "Não foi possível verificar esta conexão. Tente novamente pela página publicada.",
      },
      503,
    );
  try {
    const verification = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: config.secret,
          response: body.captcha,
          idempotency_key: body.id,
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!verification.ok)
      return json(
        { error: "A verificação está indisponível. Tente novamente." },
        503,
      );
    const checked = (await verification.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
    };
    if (
      !checked.success ||
      checked.hostname !== config.hostname ||
      checked.action !== "demand"
    )
      return json(
        { error: "Refaça a verificação de segurança antes de enviar." },
        400,
      );
    const fingerprint = createHmac("sha256", config.secret)
      .update(body.store + ":" + address)
      .digest("hex");
    const client = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
      },
    });
    const result = await client.rpc("reposita_submit_public_demand", {
      p_request: body.id,
      p_token: body.store,
      p_input: input,
      p_fingerprint: fingerprint,
    });
    if (result.error) {
      const message = result.error.message;
      if (message.includes("Limite de solicitações"))
        return json(
          {
            error:
              "Muitas solicitações nesta conexão ou loja. Tente mais tarde.",
          },
          429,
        );
      if (message.includes("já foi registrado"))
        return json(
          {
            error:
              "Seu interesse neste produto já foi registrado recentemente.",
          },
          409,
        );
      if (message.includes("Loja indisponível"))
        return json(
          { error: "Esta loja não está recebendo solicitações." },
          404,
        );
      return json(
        {
          error:
            "Não foi possível registrar a solicitação. Tente novamente mais tarde.",
        },
        503,
      );
    }
    return json({ ok: true }, 201);
  } catch {
    return json(
      {
        error: "O serviço está temporariamente indisponível. Tente novamente.",
      },
      503,
    );
  }
}

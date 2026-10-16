import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
const db = new PGlite();
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const payload = {
  name: "Anterior",
  sku: "PRE1",
  category: "Geral",
  initial_stock: 10,
  min_stock: 5,
  cost: 10,
  price: 20,
};
let original = "";
const migration = (name: string) =>
  readFileSync(
    new URL("../supabase/migrations/" + name, import.meta.url),
    "utf8",
  );
async function user(id: string) {
  await db.exec("reset role;set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 insert into auth.users values('${a}'),('${b}');create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
 grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
  await db.exec(migration("202610160001_reposita.sql"));
  await user(a);
  original = (
    await db.query<{ id: string }>(
      "select public.reposita_save_product(null,$1::jsonb) id",
      [JSON.stringify(payload)],
    )
  ).rows[0].id;
  await db.exec("reset role;");
  await db.exec(migration("202610160002_professional.sql"));
}, 30000);
afterAll(async () => {
  await db.close();
});
describe.sequential(
  "atualização preserva dados e protege Storage/importação",
  () => {
    it("mantém produto e histórico anteriores", async () => {
      await user(a);
      const rows = await db.query<{ stock: number; name: string }>(
        "select * from public.reposita_products where id=$1",
        [original],
      );
      expect(rows.rows[0].stock).toBe(10);
      expect(rows.rows[0].name).toBe("Anterior");
      expect(
        (await db.query("select * from public.reposita_movements")).rows,
      ).toHaveLength(1);
    });
    it("cria bucket privado com limites", async () => {
      await db.exec("reset role;");
      const row = (
        await db.query<{ public: boolean; file_size_limit: number }>(
          "select * from storage.buckets where id='reposita-products'",
        )
      ).rows[0];
      expect(row.public).toBe(false);
      expect(Number(row.file_size_limit)).toBe(5242880);
    });
    it("permite foto e metadados só de objeto da própria pasta", async () => {
      await user(a);
      const path = a + "/33333333-3333-4333-8333-333333333333.webp";
      await db.query(
        "insert into storage.objects(bucket_id,name) values('reposita-products',$1)",
        [path],
      );
      await db.query("select public.reposita_save_product($1,$2::jsonb)", [
        original,
        JSON.stringify({
          ...payload,
          image_path: path,
          supplier: "Fornecedor A",
          description: "Descrição real",
        }),
      ]);
      const row = (
        await db.query<{ image_path: string; supplier: string }>(
          "select * from public.reposita_products where id=$1",
          [original],
        )
      ).rows[0];
      expect(row.image_path).toBe(path);
      expect(row.supplier).toBe("Fornecedor A");
    });
    it("isola leitura, upload e vínculo de imagem entre contas", async () => {
      await user(b);
      expect(
        (await db.query("select * from storage.objects")).rows,
      ).toHaveLength(0);
      await expect(
        db.query(
          "insert into storage.objects(bucket_id,name) values('reposita-products',$1)",
          [a + "/44444444-4444-4444-8444-444444444444.webp"],
        ),
      ).rejects.toThrow();
      await expect(
        db.query("select public.reposita_save_product(null,$1::jsonb)", [
          JSON.stringify({
            ...payload,
            sku: "B1",
            image_path: a + "/33333333-3333-4333-8333-333333333333.webp",
          }),
        ]),
      ).rejects.toThrow("foto");
    });
    it("importa lote de forma idempotente com saldo inicial", async () => {
      await user(a);
      const items = [
        { ...payload, name: "Importado A", sku: "IMP1" },
        { ...payload, name: "Importado B", sku: "IMP2" },
      ];
      for (let i = 0; i < 2; i++)
        await db.query("select public.reposita_import_products($1,$2::jsonb)", [
          "55555555-5555-4555-8555-555555555555",
          JSON.stringify(items),
        ]);
      expect(
        (
          await db.query(
            "select * from public.reposita_products where sku like 'IMP%'",
          )
        ).rows,
      ).toHaveLength(2);
    });
    it("reverte o lote inteiro se qualquer linha for inválida", async () => {
      await expect(
        db.query("select public.reposita_import_products($1,$2::jsonb)", [
          "66666666-6666-4666-8666-666666666666",
          JSON.stringify([
            { ...payload, sku: "ROLLBACK1" },
            { ...payload, sku: "PRE1" },
          ]),
        ]),
      ).rejects.toThrow();
      expect(
        (
          await db.query(
            "select * from public.reposita_products where sku='ROLLBACK1'",
          )
        ).rows,
      ).toHaveLength(0);
    });
    it("rejeita payload alterado no mesmo UUID de lote", async () => {
      await expect(
        db.query("select public.reposita_import_products($1,$2::jsonb)", [
          "55555555-5555-4555-8555-555555555555",
          JSON.stringify([{ ...payload, sku: "OTHER" }]),
        ]),
      ).rejects.toThrow("Identificador");
    });
    it("restaura um produto próprio, sem permitir acesso cruzado", async () => {
      const id = (
        await db.query<{ id: string }>(
          "select public.reposita_save_product(null,$1::jsonb) id",
          [JSON.stringify({ ...payload, sku: "REST1", initial_stock: 0 })],
        )
      ).rows[0].id;
      await db.query("select public.reposita_archive_product($1)", [id]);
      await db.query("select public.reposita_restore_product($1)", [id]);
      expect(
        (
          await db.query<{ active: boolean }>(
            "select active from public.reposita_products where id=$1",
            [id],
          )
        ).rows[0].active,
      ).toBe(true);
      await user(b);
      await expect(
        db.query("select public.reposita_restore_product($1)", [id]),
      ).rejects.toThrow();
    });
    it("reexecução da atualização não apaga dados existentes", async () => {
      await db.exec("reset role;");
      await db.exec(migration("202610160002_professional.sql"));
      await user(a);
      expect(
        (await db.query("select * from public.reposita_products")).rows.length,
      ).toBeGreaterThan(3);
    });
  },
);

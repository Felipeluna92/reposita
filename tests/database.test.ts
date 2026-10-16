import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const request = "33333333-3333-4333-8333-333333333333";
const db = new PGlite();
let productId = "";
const input = {
  name: "Produto A",
  sku: "A1",
  category: "Geral",
  initial_stock: 10,
  min_stock: 2,
  cost: 10,
  price: 25,
};
async function asUser(id: string) {
  await db.exec("reset role; set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
const stock = async () =>
  (
    await db.query<{ stock: number }>(
      "select stock from public.reposita_products where id=$1",
      [productId],
    )
  ).rows[0]?.stock;
const move = (quantity: number, req = request) =>
  db.query(
    "select public.reposita_move_stock($1,$2,'sale',$3,10,25,'Venda teste')",
    [req, productId, quantity],
  );
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${userA}'),('${userB}');`);
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202610160001_reposita.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe.sequential(
  "migration e segurança num Postgres isolado (PGlite)",
  () => {
    it("cria produto e saldo inicial com proprietário da sessão", async () => {
      await asUser(userA);
      const result = await db.query<{ id: string }>(
        "select public.reposita_save_product(null,$1::jsonb) as id",
        [JSON.stringify(input)],
      );
      productId = result.rows[0].id;
      expect(await stock()).toBe(10);
      expect(
        (await db.query("select * from public.reposita_movements")).rows,
      ).toHaveLength(1);
    });
    it("registra venda e reenvio idempotente sem duplicar saída", async () => {
      await move(2);
      await move(2);
      expect(await stock()).toBe(8);
      expect(
        (await db.query("select * from public.reposita_movements")).rows,
      ).toHaveLength(2);
    });
    it("rejeita reutilização do UUID com payload diferente", async () => {
      await expect(move(1)).rejects.toThrow();
      expect(await stock()).toBe(8);
    });
    it("rejeita estoque negativo sem gravar histórico", async () => {
      await expect(
        move(9, "44444444-4444-4444-8444-444444444444"),
      ).rejects.toThrow("Estoque insuficiente");
      expect(await stock()).toBe(8);
      expect(
        (await db.query("select * from public.reposita_movements")).rows,
      ).toHaveLength(2);
    });
    it("bloqueia escrita direta no saldo", async () => {
      await expect(
        db.query("update public.reposita_products set stock=999 where id=$1", [
          productId,
        ]),
      ).rejects.toThrow();
    });
    it("não arquiva estoque com saldo e mantém o histórico em edições", async () => {
      await expect(
        db.query("select public.reposita_archive_product($1)", [productId]),
      ).rejects.toThrow();
      await db.query("select public.reposita_save_product($1,$2::jsonb)", [
        productId,
        JSON.stringify({ ...input, price: 99, initial_stock: 500 }),
      ]);
      expect(await stock()).toBe(8);
      const rows = await db.query<{ unit_price: string }>(
        "select unit_price from public.reposita_movements where kind='sale'",
      );
      expect(Number(rows.rows[0].unit_price)).toBe(25);
    });
    it("isola leituras por usuário e bloqueia escrita cruzada via RPC", async () => {
      await asUser(userB);
      expect(
        (await db.query("select * from public.reposita_products")).rows,
      ).toHaveLength(0);
      expect(
        (await db.query("select * from public.reposita_movements")).rows,
      ).toHaveLength(0);
      await expect(move(1)).rejects.toThrow("Produto não encontrado");
      await expect(
        db.query("select public.reposita_save_product($1,$2::jsonb)", [
          productId,
          JSON.stringify(input),
        ]),
      ).rejects.toThrow("Produto não encontrado");
    });
    it("nega acesso anônimo a dados e RPC", async () => {
      await db.exec("reset role; set role anon;");
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
      await expect(
        db.query("select * from public.reposita_products"),
      ).rejects.toThrow();
      await expect(
        db.query("select public.reposita_save_product(null,$1::jsonb)", [
          JSON.stringify(input),
        ]),
      ).rejects.toThrow();
    });
  },
);

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const db = new PGlite();
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const sql = (name: string) =>
  readFileSync(
    new URL("../supabase/migrations/" + name, import.meta.url),
    "utf8",
  );
const migration = sql("202610170003_demand.sql");
let product = "",
  demand = "",
  test = "",
  token = "";
const request = {
  label: "Pneu",
  variant: "Aro 15",
  reason: "missing",
  quantity: 2,
  budget: 100,
  note: "",
  contact: "",
  contact_consent: false,
};
async function user(id: string) {
  await db.exec("reset role;set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function publicRole(role = "anon") {
  await db.exec("reset role;set role " + role + ";");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
}
const saveDemand = (id: string, input: unknown) =>
  db.query("select public.reposita_save_demand($1,$2::jsonb)", [
    id,
    JSON.stringify(input),
  ]);
const submit = (
  id: string,
  input: unknown = request,
  fingerprint = "a".repeat(64),
) =>
  db.query("select public.reposita_submit_public_demand($1,$2,$3::jsonb,$4)", [
    id,
    token,
    JSON.stringify(input),
    fingerprint,
  ]);
beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 insert into auth.users values('${a}'),('${b}');create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
 grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
  await db.exec(sql("202610160001_reposita.sql"));
  await db.exec(sql("202610160002_professional.sql"));
  await user(a);
  product = (
    await db.query<{ id: string }>(
      "select public.reposita_save_product(null,$1::jsonb) id",
      [
        JSON.stringify({
          name: "Pneu",
          sku: "P1",
          category: "Auto",
          initial_stock: 10,
          cost: 10,
          price: 30,
          min_stock: 2,
          description: "Preservar cadastro",
        }),
      ],
    )
  ).rows[0].id;
  await db.query(
    "select public.reposita_move_stock($1,$2,'sale',2,10,30,'Venda anterior')",
    [randomUUID(), product],
  );
  await db.exec("reset role");
  await db.exec(migration);
  await db.exec(migration);
}, 30000);
afterAll(async () => {
  await db.close();
});
describe.sequential("procura e testes no Postgres com RLS", () => {
  it("migration aditiva e repetível preserva saldo, foto/metadados e vendas", async () => {
    await user(a);
    expect(
      (
        await db.query(
          "select stock,cost,description from public.reposita_products",
        )
      ).rows[0],
    ).toMatchObject({
      stock: 8,
      cost: "10.00",
      description: "Preservar cadastro",
    });
    expect(
      (await db.query("select * from public.reposita_movements")).rows,
    ).toHaveLength(2);
  });
  it("atualiza custo médio transacional e não reprecifica venda antiga", async () => {
    await db.query(
      "select public.reposita_move_stock($1,$2,'purchase',2,20,30,'Reposição')",
      [randomUUID(), product],
    );
    expect(
      (await db.query("select stock,cost from public.reposita_products"))
        .rows[0],
    ).toMatchObject({ stock: 10, cost: "12.00" });
    expect(
      (
        await db.query(
          "select unit_cost from public.reposita_movements where kind='sale'",
        )
      ).rows[0],
    ).toMatchObject({ unit_cost: "10.00" });
  });
  it("salva procura e exige consentimento no banco", async () => {
    demand = randomUUID();
    await saveDemand(demand, { ...request, product_id: product });
    expect(
      (await db.query("select * from public.reposita_demands")).rows,
    ).toHaveLength(1);
    await expect(
      saveDemand(randomUUID(), { ...request, contact: "11999999999" }),
    ).rejects.toThrow("autorização");
    await expect(
      saveDemand(randomUUID(), { ...request, quantity: -1 }),
    ).rejects.toThrow();
  });
  it("isola contas e bloqueia escrita direta", async () => {
    await user(b);
    expect(
      (await db.query("select * from public.reposita_demands")).rows,
    ).toHaveLength(0);
    await expect(saveDemand(demand, request)).rejects.toThrow("não encontrado");
    await expect(
      saveDemand(randomUUID(), { ...request, product_id: product }),
    ).rejects.toThrow();
    await expect(
      db.query("insert into public.reposita_demands(id) values($1)", [
        randomUUID(),
      ]),
    ).rejects.toThrow();
  });
  it("exclui contato sem apagar o sinal e seu histórico de origem", async () => {
    await user(a);
    await saveDemand(demand, {
      ...request,
      product_id: product,
      contact: "11999999999",
      contact_consent: true,
    });
    await db.query(
      "select public.reposita_demand_action($1,'forget_contact')",
      [demand],
    );
    expect(
      (
        await db.query(
          "select contact,contact_consent,consent_at from public.reposita_demands where id=$1",
          [demand],
        )
      ).rows[0],
    ).toEqual({ contact: "", contact_consent: false, consent_at: null });
  });
  it("salva plano sem alterar estoque; compra uma única vez com frete e custo médio", async () => {
    test = randomUUID();
    const input = {
      product_id: product,
      title: "Fornecedor A",
      quantity: 10,
      unit_cost: 20,
      freight: 10,
      packaging: 1,
      sale_price: 40,
      fee: 5,
      tax: 5,
      expected_units: 8,
      days: 30,
      note: "",
    };
    await db.query("select public.reposita_save_purchase_test($1,$2::jsonb)", [
      test,
      JSON.stringify(input),
    ]);
    expect(
      (await db.query("select stock from public.reposita_products")).rows[0],
    ).toMatchObject({ stock: 10 });
    await db.query(
      "select public.reposita_purchase_test_action($1,'purchase','')",
      [test],
    );
    await db.query(
      "select public.reposita_purchase_test_action($1,'purchase','')",
      [test],
    );
    expect(
      (await db.query("select stock,cost from public.reposita_products"))
        .rows[0],
    ).toMatchObject({ stock: 20, cost: "16.50" });
    expect(
      (
        await db.query("select * from public.reposita_movements where id=$1", [
          test,
        ])
      ).rows,
    ).toHaveLength(1);
    await expect(
      db.query("select public.reposita_save_purchase_test($1,$2::jsonb)", [
        test,
        JSON.stringify({ ...input, quantity: 99 }),
      ]),
    ).rejects.toThrow("não editável");
    await db.query(
      "select public.reposita_purchase_test_action($1,'complete','Fazer lote menor')",
      [test],
    );
    expect(
      (
        await db.query(
          "select status,outcome_note from public.reposita_purchase_tests where id=$1",
          [test],
        )
      ).rows[0],
    ).toMatchObject({ status: "completed", outcome_note: "Fazer lote menor" });
  });
  it("rejeita compra inválida sem gravar evento nem mudar saldo/custo", async () => {
    const id = randomUUID();
    await expect(
      db.query(
        "select public.reposita_move_stock($1,$2,'purchase',10,-1,30,'Inválida')",
        [id, product],
      ),
    ).rejects.toThrow();
    expect(
      (await db.query("select stock,cost from public.reposita_products"))
        .rows[0],
    ).toMatchObject({ stock: 20, cost: "16.50" });
    expect(
      (
        await db.query("select * from public.reposita_movements where id=$1", [
          id,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("página pública expõe só nome/token e não aceita ingestão anônima direta", async () => {
    token = (
      await db.query<{ token: string }>(
        "select public.reposita_save_public_store('Loja A',true,false) token",
      )
    ).rows[0].token;
    await publicRole();
    const info = (
      await db.query<{ info: unknown }>(
        "select public.reposita_public_store_info($1) info",
        [token],
      )
    ).rows[0].info;
    expect(info).toEqual({
      name: "Loja A",
      public_token: token,
      enabled: true,
    });
    await expect(
      db.query("select * from public.reposita_demands"),
    ).rejects.toThrow();
    await expect(submit(randomUUID())).rejects.toThrow("permission denied");
  });
  it("serviço recebe sem proprietário fornecido e repete requisição sem duplicar", async () => {
    await publicRole("service_role");
    const id = randomUUID();
    await submit(id, {
      ...request,
      user_id: b,
      product_id: product,
      status: "closed",
    });
    await submit(id, request);
    const row = (
      await db.query(
        "select user_id,product_id,status,source from public.reposita_demands where id=$1",
        [id],
      )
    ).rows[0];
    expect(row).toEqual({
      user_id: a,
      product_id: null,
      status: "new",
      source: "public",
    });
    await expect(submit(randomUUID(), request)).rejects.toThrow(
      "já foi registrado",
    );
  });
  it("limita solicitações por conexão/loja no banco", async () => {
    for (let i = 1; i < 10; i++)
      await submit(randomUUID(), { ...request, label: "Produto " + i });
    await expect(
      submit(randomUUID(), { ...request, label: "Excedente" }),
    ).rejects.toThrow("Limite");
  });
  it("desativa e rotaciona links sem abrir dados privados", async () => {
    await user(a);
    const previous = token;
    token = (
      await db.query<{ token: string }>(
        "select public.reposita_save_public_store('Loja A',true,true) token",
      )
    ).rows[0].token;
    expect(token).not.toBe(previous);
    await publicRole();
    expect(
      (
        await db.query<{ info: unknown }>(
          "select public.reposita_public_store_info($1) info",
          [previous],
        )
      ).rows[0].info,
    ).toBeNull();
    await user(a);
    await db.query(
      "select public.reposita_save_public_store('Loja A',false,false)",
    );
    await publicRole("service_role");
    await expect(submit(randomUUID(), request, "b".repeat(64))).rejects.toThrow(
      "Loja indisponível",
    );
  });
});

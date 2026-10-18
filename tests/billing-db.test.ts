import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const db = new PGlite();
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
type Mode = "test" | "live";
type Plan = "essential" | "professional" | "business";
type BillingState = {
  settings: {
    enabled: boolean;
    mode: Mode;
    trial_days: number;
    trial_products: number;
  };
  access: {
    allowed: boolean;
    is_owner: boolean;
    status: string;
    product_limit: number | null;
    used: number;
    plan_code: Plan | null;
    trial_ends_at: string;
  };
  admin: { test_verified: boolean } | null;
};
const productInput = {
  name: "Produto de teste",
  sku: "",
  category: "Geral",
  initial_stock: 0,
  min_stock: 2,
  cost: 10,
  price: 25,
};
const demandInput = {
  label: "Produto procurado",
  variant: "",
  reason: "missing",
  quantity: 1,
  budget: null,
  note: "",
  contact: "11999999999",
  contact_consent: true,
};
const sql = (name: string) =>
  readFileSync(
    new URL("../supabase/migrations/" + name, import.meta.url),
    "utf8",
  );

async function asRole(
  role: "authenticated" | "anon" | "service_role",
  id = "",
) {
  await db.exec("reset role;set role " + role);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
const asUser = (id = a) => asRole("authenticated", id);
async function configure(enabled = true, mode: Mode = "test") {
  await db.exec("reset role");
  await db.query(
    `update public.reposita_billing_settings
    set enabled=$1,mode=$2,activated_at=now()-interval '8 days' where id`,
    [enabled, mode],
  );
}
async function expire(id = a) {
  await db.exec("reset role");
  await db.query("select public.reposita_billing_ensure_profile($1)", [id]);
  await db.query(
    `update public.reposita_billing_profiles
    set trial_ends_at=now()-interval '1 day' where user_id=$1`,
    [id],
  );
}
async function state() {
  return (
    await db.query<{ state: BillingState }>(
      "select public.reposita_billing_state() state",
    )
  ).rows[0].state;
}
async function saveProduct(
  input: Partial<typeof productInput> = {},
  id: string | null = null,
) {
  return (
    await db.query<{ id: string }>(
      "select public.reposita_save_product($1,$2::jsonb) id",
      [id, JSON.stringify({ ...productInput, ...input })],
    )
  ).rows[0].id;
}
const importProducts = (
  count: number,
  request = randomUUID(),
  initialStock = 0,
) =>
  db.query("select public.reposita_import_products($1,$2::jsonb)", [
    request,
    JSON.stringify(
      Array.from({ length: count }, (_, i) => ({
        ...productInput,
        name: "Importado " + i,
        initial_stock: initialStock,
      })),
    ),
  ]);
const move = (product: string, request = randomUUID()) =>
  db.query(
    "select public.reposita_move_stock($1,$2,'purchase',2,20,25,'Reposição')",
    [request, product],
  );
async function saveDemand() {
  const id = randomUUID();
  await db.query("select public.reposita_save_demand($1,$2::jsonb)", [
    id,
    JSON.stringify(demandInput),
  ]);
  return id;
}
async function saveTest(product: string) {
  const id = randomUUID();
  await db.query("select public.reposita_save_purchase_test($1,$2::jsonb)", [
    id,
    JSON.stringify({
      product_id: product,
      title: "Compra piloto",
      quantity: 2,
      unit_cost: 20,
      freight: 2,
      packaging: 0,
      sale_price: 30,
      fee: 0,
      tax: 0,
      expected_units: 2,
      days: 7,
      note: "",
    }),
  ]);
  return id;
}
async function saveStore() {
  return (
    await db.query<{ token: string }>(
      "select public.reposita_save_public_store('Loja A',true,false) token",
    )
  ).rows[0].token;
}
const submitPublic = (
  token: string,
  id = randomUUID(),
  fingerprint = "a".repeat(64),
) =>
  db.query("select public.reposita_submit_public_demand($1,$2,$3::jsonb,$4)", [
    id,
    token,
    JSON.stringify(demandInput),
    fingerprint,
  ]);

// Expected SQL errors abort a transaction. A savepoint lets assertions inspect
// the unchanged records afterwards without weakening per-test rollback isolation.
async function denied(
  action: () => Promise<unknown>,
  message?: string | RegExp,
) {
  await db.exec("savepoint denied_write");
  let failure: unknown;
  try {
    await action();
  } catch (error) {
    failure = error;
  }
  await db.exec(
    "rollback to savepoint denied_write;release savepoint denied_write",
  );
  expect(failure).toBeInstanceOf(Error);
  if (message !== undefined) {
    const text = (failure as Error).message;
    if (typeof message === "string") expect(text).toContain(message);
    else expect(text).toMatch(message);
  }
}
async function setupPayments() {
  await asRole("service_role");
  for (const mode of ["test", "live"] as const) {
    await db.query(
      `select public.reposita_billing_save_setup(
      $1,$2::jsonb,$3,$4,$5,'acct_fixture',true,'support@example.com')`,
      [
        mode,
        JSON.stringify(
          (["essential", "professional", "business"] as const).map((code) => ({
            code,
            price_id: `price_${mode}_${code}`,
            product_id: `prod_${mode}_${code}`,
          })),
        ),
        `we_${mode}`,
        `whsec_${mode}_fixture`,
        `bpc_${mode}`,
      ],
    );
    await db.query(
      `insert into public.reposita_billing_customers(user_id,mode,customer_id)
      values($1,$2,$3)`,
      [a, mode, `cus_${mode}_a`],
    );
  }
}
async function applySubscription(
  options: {
    mode?: Mode;
    event?: string;
    plan?: Plan;
    status?: string;
    observed?: string;
    customer?: string;
    price?: string;
    verified?: boolean;
    end?: string;
  } = {},
) {
  const mode = options.mode ?? "test";
  const args: unknown[] = [
    a,
    mode,
    options.event ?? "evt_" + randomUUID(),
    `sub_${mode}_a`,
    options.customer ?? `cus_${mode}_a`,
    options.price ?? `price_${mode}_${options.plan ?? "essential"}`,
    options.status ?? "active",
    options.end ?? "2099-01-01T00:00:00Z",
    false,
    options.observed ?? "2026-10-17T12:00:00Z",
  ];
  // Omitting the last argument deliberately verifies its default false behavior.
  if (options.verified !== undefined) args.push(options.verified);
  const placeholders = args.map((_, i) => "$" + (i + 1)).join(",");
  return (
    await db.query<{ applied: boolean }>(
      `select public.reposita_billing_apply_subscription(${placeholders}) applied`,
      args,
    )
  ).rows[0].applied;
}
async function ownerState() {
  await asUser(owner);
  return state();
}

beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated,anon,service_role;
    insert into auth.users values('${a}'),('${b}'),('${owner}');
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$select string_to_array(name,'/')$$;
    grant usage on schema storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;`);
  for (const file of [
    "202610160001_reposita.sql",
    "202610160002_professional.sql",
    "202610170003_demand.sql",
    "202610170004_store_pages.sql",
    "202610170005_billing.sql",
  ])
    await db.exec(sql(file));
  await db.query(
    "insert into public.reposita_billing_owners(user_id) values($1)",
    [owner],
  );
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback;reset role");
});
afterAll(async () => {
  await db.close();
});

describe.sequential(
  "billing 005 no Postgres: permissões, cotas e eventos",
  () => {
    it("inicia desabilitado com trial de sete dias/50 e planos 100/1000/5000", async () => {
      await asUser();
      expect(await state()).toMatchObject({
        settings: {
          enabled: false,
          mode: "test",
          trial_days: 7,
          trial_products: 50,
        },
        access: { allowed: true, status: "setup", product_limit: null },
        admin: null,
      });
      await db.exec("reset role");
      expect(
        (
          await db.query(
            "select code,product_limit from public.reposita_billing_plans order by sort_order",
          )
        ).rows,
      ).toEqual([
        { code: "essential", product_limit: 100 },
        { code: "professional", product_limit: 1000 },
        { code: "business", product_limit: 5000 },
      ]);
    });

    it("set_enabled registra a primeira ativação; repetir ou desativar/reativar não reinicia o trial", async () => {
      await expire();
      await asRole("service_role");
      const activation = async () =>
        (
          await db.query<{
            enabled: boolean;
            activated_at: string | null;
          }>(
            `select enabled,activated_at::text from public.reposita_billing_settings where id`,
          )
        ).rows[0];
      const setEnabled = (enabled: boolean) =>
        db.query("select public.reposita_billing_set_enabled($1)", [enabled]);
      expect(await activation()).toEqual({
        enabled: false,
        activated_at: null,
      });
      await setEnabled(false);
      expect(await activation()).toEqual({
        enabled: false,
        activated_at: null,
      });
      await setEnabled(true);
      const first = await activation();
      expect(first.enabled).toBe(true);
      expect(first.activated_at).not.toBeNull();
      expect(
        (
          await db.query<{
            seconds: number;
          }>(`select extract(epoch from activated_at-now())::integer seconds
      from public.reposita_billing_settings where id`)
        ).rows[0].seconds,
      ).toBe(0);
      await asUser();
      const firstTrial = (await state()).access;
      expect(firstTrial).toMatchObject({ allowed: true, status: "trial" });
      await asRole("service_role");
      expect(
        (
          await db.query<{ seconds: number }>(`select extract(epoch from
      activated_at+make_interval(days=>trial_days)-now())::integer seconds
      from public.reposita_billing_settings where id`)
        ).rows[0].seconds,
      ).toBe(7 * 86400);
      for (const enabled of [true, false, true]) {
        await setEnabled(enabled);
        expect(await activation()).toEqual({
          enabled,
          activated_at: first.activated_at,
        });
        await asUser();
        expect((await state()).access.trial_ends_at).toBe(
          firstTrial.trial_ends_at,
        );
        await asRole("service_role");
      }

      // now() is fixed within the test transaction. Backdate the fixture so a
      // regression that resets activated_at=now() cannot pass by clock equality.
      await db.query(`update public.reposita_billing_settings
      set activated_at=now()-interval '8 days' where id`);
      const original = await activation();
      const profile = (
        await db.query(
          "select trial_ends_at from public.reposita_billing_profiles where user_id=$1",
          [a],
        )
      ).rows;
      await asUser();
      const expiredTrial = (await state()).access;
      expect(expiredTrial.allowed).toBe(false);
      for (const enabled of [true, true, false, true]) {
        await asRole("service_role");
        await setEnabled(enabled);
        expect(await activation()).toEqual({
          enabled,
          activated_at: original.activated_at,
        });
        expect(
          (
            await db.query(
              "select trial_ends_at from public.reposita_billing_profiles where user_id=$1",
              [a],
            )
          ).rows,
        ).toEqual(profile);
        await asUser();
        expect((await state()).access).toMatchObject({
          allowed: !enabled,
          trial_ends_at: expiredTrial.trial_ends_at,
        });
      }
    });

    it("desabilitado preserva escritas, importação acima de 50 e restauração mesmo após expiração", async () => {
      await expire();
      await asUser();
      await importProducts(51);
      const id = await saveProduct();
      await db.query("select public.reposita_archive_product($1)", [id]);
      await db.query("select public.reposita_restore_product($1)", [id]);
      await move(id);
      await saveDemand();
      const token = await saveStore();
      expect((await state()).access).toMatchObject({
        allowed: true,
        used: 52,
        product_limit: null,
      });
      await asRole("service_role");
      await submitPublic(token);
      expect(
        (
          await db.query(
            "select stock from public.reposita_products where id=$1",
            [id],
          )
        ).rows[0],
      ).toEqual({ stock: 2 });
    });

    it("owner autenticado permanece gratuito, sem cota e sem assinatura após expiração", async () => {
      await configure();
      await expire(owner);
      await asUser(owner);
      await importProducts(51);
      const id = await saveProduct();
      await move(id);
      expect((await state()).access).toMatchObject({
        allowed: true,
        is_owner: true,
        status: "owner",
        product_limit: null,
        used: 52,
      });
      await asRole("service_role");
      expect(
        (await db.query("select * from public.reposita_billing_subscriptions"))
          .rows,
      ).toHaveLength(0);
    });

    it("cria trial de sete dias uma única vez e permite exatamente 50 produtos ativos", async () => {
      await configure();
      await asUser();
      const initial = await state();
      expect(initial.access).toMatchObject({
        allowed: true,
        status: "trial",
        product_limit: 50,
        used: 0,
      });
      await importProducts(50);
      await denied(() => saveProduct(), "Limite de 50");
      expect((await state()).access).toMatchObject({
        used: 50,
        trial_ends_at: initial.access.trial_ends_at,
      });
      await db.exec("reset role");
      expect(
        (
          await db.query<{ seconds: number }>(
            `select extract(epoch from trial_ends_at-now())::integer seconds
      from public.reposita_billing_profiles where user_id=$1`,
            [a],
          )
        ).rows[0].seconds,
      ).toBe(7 * 86400);
    });

    it("arquivados não contam; restaurar ocupa vaga e não pode ultrapassar 50", async () => {
      await configure();
      await asUser();
      const archived = await saveProduct();
      await db.query("select public.reposita_archive_product($1)", [archived]);
      await importProducts(49);
      await db.query("select public.reposita_restore_product($1)", [archived]);
      // Restoring an already active product is not another allocation.
      await db.query("select public.reposita_restore_product($1)", [archived]);
      await saveProduct({ price: 99 }, archived);
      expect((await state()).access.used).toBe(50);
      await db.query("select public.reposita_archive_product($1)", [archived]);
      await saveProduct();
      await denied(
        () =>
          db.query("select public.reposita_restore_product($1)", [archived]),
        "Limite de 50",
      );
      expect(
        (
          await db.query(
            "select active from public.reposita_products where id=$1",
            [archived],
          )
        ).rows[0],
      ).toEqual({ active: false });
    });

    it("lote que ultrapassa a cota reverte produtos, saldos iniciais e registro de importação", async () => {
      await configure();
      await asUser();
      await importProducts(49);
      const request = randomUUID();
      await denied(() => importProducts(2, request, 3), "Limite de 50");
      expect((await state()).access.used).toBe(49);
      expect(
        (await db.query("select * from public.reposita_movements")).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query("select * from public.reposita_imports where id=$1", [
            request,
          ])
        ).rows,
      ).toHaveLength(0);
      // The failed transaction did not reserve the UUID or consume a product slot.
      await importProducts(1, request, 3);
      await importProducts(1, request, 3);
      expect((await state()).access.used).toBe(50);
      expect(
        (await db.query("select * from public.reposita_movements")).rows,
      ).toHaveLength(1);
      expect(
        (
          await db.query(
            "select completed from public.reposita_imports where id=$1",
            [request],
          )
        ).rows,
      ).toEqual([{ completed: true }]);
    });

    it("expiração bloqueia movimentação sem alterar estoque, custo ou histórico", async () => {
      await configure();
      await asUser();
      const id = await saveProduct({ initial_stock: 10 });
      const before = (
        await db.query(
          "select stock,cost from public.reposita_products where id=$1",
          [id],
        )
      ).rows;
      const movements = (
        await db.query("select * from public.reposita_movements")
      ).rows;
      await expire();
      await asUser();
      expect((await state()).access.allowed).toBe(false);
      await denied(() => move(id), "Assinatura necessária");
      expect(
        (
          await db.query(
            "select stock,cost from public.reposita_products where id=$1",
            [id],
          )
        ).rows,
      ).toEqual(before);
      expect(
        (await db.query("select * from public.reposita_movements")).rows,
      ).toEqual(movements);
    });

    it.each([
      "create",
      "edit",
      "archive",
      "restore",
      "import",
      "demand",
      "store",
      "test",
    ] as const)("expiração bloqueia a escrita %s via RPC", async (action) => {
      await configure();
      await asUser();
      const id = await saveProduct();
      if (action === "restore")
        await db.query("select public.reposita_archive_product($1)", [id]);
      await expire();
      await asUser();
      const operations = {
        create: () => saveProduct(),
        edit: () => saveProduct({ price: 99 }, id),
        archive: () =>
          db.query("select public.reposita_archive_product($1)", [id]),
        restore: () =>
          db.query("select public.reposita_restore_product($1)", [id]),
        import: () => importProducts(1),
        demand: () => saveDemand(),
        store: () => saveStore(),
        test: () => saveTest(id),
      };
      await denied(operations[action], "Assinatura necessária");
    });

    it.each(["purchase", "complete", "cancel"] as const)(
      "expiração bloqueia teste de compra: %s, sem efeitos parciais",
      async (action) => {
        await configure();
        await asUser();
        const product = await saveProduct({ initial_stock: 10 });
        const test = await saveTest(product);
        if (action === "complete")
          await db.query(
            "select public.reposita_purchase_test_action($1,'purchase','')",
            [test],
          );
        const before = {
          products: (await db.query("select * from public.reposita_products"))
            .rows,
          movements: (await db.query("select * from public.reposita_movements"))
            .rows,
          tests: (
            await db.query("select * from public.reposita_purchase_tests")
          ).rows,
        };
        await expire();
        await asUser();
        await denied(
          () =>
            db.query(
              "select public.reposita_purchase_test_action($1,$2,'Fim')",
              [test, action],
            ),
          "Assinatura necessária",
        );
        expect(
          (await db.query("select * from public.reposita_products")).rows,
        ).toEqual(before.products);
        expect(
          (await db.query("select * from public.reposita_movements")).rows,
        ).toEqual(before.movements);
        expect(
          (await db.query("select * from public.reposita_purchase_tests")).rows,
        ).toEqual(before.tests);
      },
    );

    it("ingestão pública com service_role usa a assinatura da loja e bloqueia após expiração", async () => {
      await configure();
      await asUser();
      const token = await saveStore();
      await asRole("service_role");
      await submitPublic(token);
      await expire();
      await asRole("service_role");
      await denied(
        () => submitPublic(token, randomUUID(), "b".repeat(64)),
        "Loja indisponível",
      );
      expect(
        (await db.query("select user_id,source from public.reposita_demands"))
          .rows,
      ).toEqual([{ user_id: a, source: "public" }]);
    });

    it("permite apagar contato após expiração, mas bloqueia mudanças de status e conta alheia", async () => {
      await configure();
      await asUser();
      const id = await saveDemand();
      await expire();
      await asUser();
      await denied(
        () =>
          db.query("select public.reposita_demand_action($1,'closed')", [id]),
        "Assinatura necessária",
      );
      await db.query(
        "select public.reposita_demand_action($1,'forget_contact')",
        [id],
      );
      expect(
        (
          await db.query(
            `select label,status,source,contact,contact_consent,consent_at
      from public.reposita_demands where id=$1`,
            [id],
          )
        ).rows[0],
      ).toEqual({
        label: demandInput.label,
        status: "new",
        source: "manual",
        contact: "",
        contact_consent: false,
        consent_at: null,
      });
      await asRole("service_role");
      await denied(
        () =>
          db.query(
            `update public.reposita_demands
      set contact='',contact_consent=false,consent_at=null,status='closed' where id=$1`,
            [id],
          ),
        "Loja indisponível",
      );
      await asUser(b);
      await denied(
        () =>
          db.query(
            "select public.reposita_demand_action($1,'forget_contact')",
            [id],
          ),
        "não encontrado",
      );
    });

    it.each(["reposita-products", "reposita-store-pages"])(
      "Storage %s bloqueia upload expirado, preserva leitura e permite limpeza",
      async (bucket) => {
        await configure();
        await asUser();
        const path = a + "/" + randomUUID() + ".webp";
        await db.query(
          "insert into storage.objects(bucket_id,name) values($1,$2)",
          [bucket, path],
        );
        await expire();
        await asUser();
        await denied(() =>
          db.query(
            "insert into storage.objects(bucket_id,name) values($1,$2)",
            [bucket, a + "/" + randomUUID() + ".webp"],
          ),
        );
        expect(
          (await db.query("select name from storage.objects")).rows,
        ).toEqual([{ name: path }]);
        await db.query(
          "delete from storage.objects where bucket_id=$1 and name=$2",
          [bucket, path],
        );
        expect(
          (await db.query("select * from storage.objects")).rows,
        ).toHaveLength(0);
        await asUser(b);
        await denied(
          () =>
            db.query(
              "insert into storage.objects(bucket_id,name) values($1,$2)",
              [bucket, path],
            ),
          "row-level security",
        );
      },
    );

    it.each(["anon", "authenticated"] as const)(
      "%s não lê nem altera tabelas privadas ou chama RPCs de serviço",
      async (role) => {
        await asRole(role, role === "authenticated" ? a : "");
        for (const table of [
          "settings",
          "plans",
          "owners",
          "profiles",
          "customers",
          "prices",
          "private",
          "subscriptions",
          "events",
        ]) {
          await denied(
            () => db.query(`select * from public.reposita_billing_${table}`),
            "permission denied",
          );
        }
        await denied(
          () =>
            db.query(
              "update public.reposita_billing_settings set enabled=true",
            ),
          "permission denied",
        );
        await denied(
          () => db.query("select public.reposita_billing_set_enabled(true)"),
          "permission denied",
        );
        await denied(
          () =>
            db.query(
              "insert into public.reposita_billing_owners(user_id) values($1)",
              [a],
            ),
          "permission denied",
        );
        await denied(
          () => db.query("select public.reposita_billing_access($1)", [b]),
          "permission denied",
        );
        await denied(
          () =>
            db.query("select public.reposita_billing_ensure_profile($1)", [b]),
          "permission denied",
        );
        await denied(
          () =>
            db.query("select public.reposita_billing_lock($1,'test',$2)", [
              a,
              randomUUID(),
            ]),
          "permission denied",
        );
        await denied(
          () =>
            db.query("select public.reposita_billing_release($1,'test',$2)", [
              a,
              randomUUID(),
            ]),
          "permission denied",
        );
        await denied(
          () =>
            db.query(`select public.reposita_billing_save_setup('test','[]'::jsonb,
      'we_fixture','whsec_fixture','bpc_fixture','acct_fixture',true,'support@example.com')`),
          "permission denied",
        );
        await denied(() => applySubscription(), "permission denied");
        await denied(
          () => applySubscription({ verified: true }),
          "permission denied",
        );
        if (role === "anon") await denied(() => state(), "permission denied");
        else {
          expect((await state()).access.is_owner).toBe(false);
          await denied(
            () =>
              db.query("select public.reposita_billing_can_write($1)", [owner]),
            "Conta não autorizada",
          );
        }
      },
    );

    it("isola produtos e não aceita transferência de proprietário nem com service_role", async () => {
      await configure();
      await asUser();
      const id = await saveProduct();
      await asUser(b);
      expect((await state()).access.used).toBe(0);
      expect(
        (await db.query("select * from public.reposita_products")).rows,
      ).toHaveLength(0);
      await denied(() => saveProduct({}, id), "Produto não encontrado");
      await denied(
        () => db.query("select public.reposita_restore_product($1)", [id]),
        "Produto não encontrado",
      );
      await asRole("service_role");
      await denied(
        () =>
          db.query(
            "update public.reposita_products set user_id=$1 where id=$2",
            [b, id],
          ),
        "Proprietário não pode ser alterado",
      );
    });

    it.each([
      ["essential", 100],
      ["professional", 1000],
      ["business", 5000],
    ] as const)(
      "assinatura %s concede cota %i após fim do trial",
      async (plan, limit) => {
        await setupPayments();
        await configure();
        await expire();
        await asRole("service_role");
        expect(await applySubscription({ plan, verified: true })).toBe(true);
        await asUser();
        expect((await state()).access).toMatchObject({
          allowed: true,
          plan_code: plan,
          product_limit: limit,
        });
        await saveProduct();
      },
    );

    it("assinatura ativa com período vencido não concede escrita sem novo webhook", async () => {
      await setupPayments();
      await configure();
      await expire();
      await asRole("service_role");
      await applySubscription({ end: "2000-01-01T00:00:00Z", verified: true });
      await asUser();
      expect((await state()).access.allowed).toBe(false);
      await denied(() => saveProduct(), "Assinatura necessária");
    });

    it("assinatura test não libera live; o mesmo event_id é independente em cada modo", async () => {
      await setupPayments();
      await configure();
      await expire();
      await asRole("service_role");
      expect(
        await applySubscription({ event: "evt_shared", verified: true }),
      ).toBe(true);
      await asUser();
      expect((await state()).access.allowed).toBe(true);
      await configure(true, "live");
      await asUser();
      expect((await state()).access.allowed).toBe(false);
      await denied(() => saveProduct(), "Assinatura necessária");
      await asRole("service_role");
      expect(
        await applySubscription({
          mode: "live",
          event: "evt_shared",
          plan: "professional",
          verified: true,
        }),
      ).toBe(true);
      await asUser();
      expect((await state()).access).toMatchObject({
        allowed: true,
        plan_code: "professional",
        product_limit: 1000,
      });
      await configure(true, "test");
      await asUser();
      expect((await state()).access).toMatchObject({
        allowed: true,
        plan_code: "essential",
        product_limit: 100,
      });
    });

    it("rejeita cliente de outra conta/modo sem registrar evento ou assinatura", async () => {
      await setupPayments();
      await db.query(
        `insert into public.reposita_billing_customers(user_id,mode,customer_id)
      values($1,'test','cus_test_b')`,
        [b],
      );
      for (const customer of ["cus_test_b", "cus_live_a"]) {
        await denied(
          () => applySubscription({ customer }),
          "Cliente de pagamento não corresponde",
        );
      }
      expect(
        (await db.query("select * from public.reposita_billing_subscriptions"))
          .rows,
      ).toHaveLength(0);
      expect(
        (await db.query("select * from public.reposita_billing_events")).rows,
      ).toHaveLength(0);
    });

    it("preço de outro modo não concede plano nem libera conta expirada", async () => {
      await setupPayments();
      await configure();
      await expire();
      await asRole("service_role");
      await applySubscription({ price: "price_live_business" });
      await asUser();
      expect((await state()).access).toMatchObject({
        allowed: false,
        plan_code: null,
      });
      await denied(() => saveProduct(), "Assinatura necessária");
    });

    it("evento duplicado não altera assinatura nem prova de pagamento", async () => {
      await setupPayments();
      await asRole("service_role");
      expect(await applySubscription({ event: "evt_duplicate" })).toBe(true);
      const before = (
        await db.query("select * from public.reposita_billing_subscriptions")
      ).rows;
      expect(
        await applySubscription({
          event: "evt_duplicate",
          plan: "business",
          status: "canceled",
          observed: "2026-10-19T12:00:00Z",
          verified: true,
        }),
      ).toBe(false);
      expect(
        (await db.query("select * from public.reposita_billing_subscriptions"))
          .rows,
      ).toEqual(before);
      expect(
        (await db.query("select * from public.reposita_billing_events")).rows,
      ).toHaveLength(1);
      expect((await ownerState()).admin?.test_verified).toBe(false);
    });

    it("evento antigo não reativa assinatura cancelada, mas preserva prova válida de pagamento", async () => {
      await setupPayments();
      await configure();
      await expire();
      await asRole("service_role");
      expect(
        await applySubscription({
          event: "evt_latest",
          status: "canceled",
          observed: "2026-10-19T12:00:00Z",
        }),
      ).toBe(true);
      const before = (
        await db.query("select * from public.reposita_billing_subscriptions")
      ).rows;
      expect(
        await applySubscription({
          event: "evt_old",
          observed: "2026-10-18T12:00:00Z",
          verified: true,
        }),
      ).toBe(false);
      expect(
        (await db.query("select * from public.reposita_billing_subscriptions"))
          .rows,
      ).toEqual(before);
      expect(
        (
          await db.query(
            "select applied,payment_verified from public.reposita_billing_events where event_id='evt_old'",
          )
        ).rows,
      ).toEqual([{ applied: false, payment_verified: true }]);
      await asUser();
      expect((await state()).access.allowed).toBe(false);
      expect((await ownerState()).admin?.test_verified).toBe(true);
      await asRole("service_role");
      expect(
        await applySubscription({
          event: "evt_new",
          observed: "2026-10-20T12:00:00Z",
          verified: true,
        }),
      ).toBe(true);
      await asUser();
      expect((await state()).access.allowed).toBe(true);
      expect((await ownerState()).admin?.test_verified).toBe(true);
    });

    it("prova test exige payment_verified explícito; evento live ou test sem prova não basta", async () => {
      await setupPayments();
      await asRole("service_role");
      await applySubscription({ mode: "live", verified: true });
      expect((await ownerState()).admin?.test_verified).toBe(false);
      await asRole("service_role");
      await applySubscription({ event: "evt_default_false" });
      expect(
        (
          await db.query(
            "select payment_verified from public.reposita_billing_events where event_id='evt_default_false'",
          )
        ).rows,
      ).toEqual([{ payment_verified: false }]);
      expect((await ownerState()).admin?.test_verified).toBe(false);
      await asRole("service_role");
      await applySubscription({
        event: "evt_explicit_false",
        observed: "2026-10-18T12:00:00Z",
        verified: false,
      });
      expect((await ownerState()).admin?.test_verified).toBe(false);
      await asRole("service_role");
      await applySubscription({
        event: "evt_verified",
        observed: "2026-10-19T12:00:00Z",
        verified: true,
      });
      expect(
        (
          await db.query(
            "select applied,payment_verified from public.reposita_billing_events where event_id='evt_verified'",
          )
        ).rows,
      ).toEqual([{ applied: true, payment_verified: true }]);
      expect((await ownerState()).admin?.test_verified).toBe(true);
    });
  },
);

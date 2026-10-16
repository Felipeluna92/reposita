-- Apply once in the Supabase SQL Editor. All DDL is transactional.
-- Names are prefixed to avoid colliding with other apps in the same project.
begin;
create table public.reposita_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  sku text not null default '' check (length(sku) <= 60),
  category text not null default 'Geral' check (length(category) between 1 and 80),
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 5 check (min_stock >= 0),
  cost numeric(12,2) not null default 0 check (cost >= 0 and cost <> 'NaN'::numeric),
  price numeric(12,2) not null default 0 check (price >= 0 and price <> 'NaN'::numeric),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, user_id)
);
create unique index reposita_products_sku on public.reposita_products(user_id, sku) where sku <> '';
create index reposita_products_owner on public.reposita_products(user_id, active, created_at desc);
create table public.reposita_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null,
  kind text not null check (kind in ('purchase', 'sale', 'adjustment_in', 'adjustment_out')),
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0 and unit_cost <> 'NaN'::numeric),
  unit_price numeric(12,2) not null check (unit_price >= 0 and unit_price <> 'NaN'::numeric),
  note text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now(),
  foreign key(product_id, user_id) references public.reposita_products(id, user_id)
);
create index reposita_movements_owner on public.reposita_movements(user_id, created_at desc);
create index reposita_movements_product on public.reposita_movements(product_id, created_at desc);

alter table public.reposita_products enable row level security;
alter table public.reposita_movements enable row level security;
create policy reposita_products_read_own on public.reposita_products for select to authenticated using (user_id = (select auth.uid()));
create policy reposita_movements_read_own on public.reposita_movements for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.reposita_products, public.reposita_movements from anon, authenticated;
grant select on public.reposita_products, public.reposita_movements to authenticated;
grant all on public.reposita_products, public.reposita_movements to service_role;

-- Writes only via RPC: ownership check + server-side validation + atomic transaction.
create function public.reposita_save_product(p_id uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_name text := btrim(p_input->>'name');
  v_sku text := btrim(coalesce(p_input->>'sku', ''));
  v_category text := coalesce(nullif(btrim(p_input->>'category'), ''), 'Geral');
  v_stock integer := coalesce((p_input->>'initial_stock')::integer, 0);
begin
  if v_user is null then raise exception 'Autenticação obrigatória.'; end if;
  if p_id is null then
    insert into public.reposita_products(user_id, name, sku, category, stock, min_stock, cost, price)
    values(v_user, v_name, v_sku, v_category, v_stock,
      (p_input->>'min_stock')::integer, (p_input->>'cost')::numeric, (p_input->>'price')::numeric)
    returning id into v_id;
    if v_stock > 0 then
      insert into public.reposita_movements(user_id, product_id, kind, quantity, unit_cost, unit_price, note)
      values(v_user, v_id, 'adjustment_in', v_stock, (p_input->>'cost')::numeric, (p_input->>'price')::numeric, 'Saldo inicial');
    end if;
  else
    update public.reposita_products set name = v_name, sku = v_sku, category = v_category,
      min_stock = (p_input->>'min_stock')::integer, cost = (p_input->>'cost')::numeric,
      price = (p_input->>'price')::numeric, updated_at = now()
    where id = p_id and user_id = v_user and active returning id into v_id;
    if v_id is null then raise exception 'Produto não encontrado.'; end if;
  end if;
  return v_id;
end;
$$;
create function public.reposita_move_stock(p_request uuid, p_product uuid, p_kind text,
  p_quantity integer, p_cost numeric, p_price numeric, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_product public.reposita_products%rowtype;
  v_previous public.reposita_movements%rowtype;
  v_delta integer;
begin
  if v_user is null then raise exception 'Autenticação obrigatória.'; end if;
  select * into v_product from public.reposita_products
    where id = p_product and user_id = v_user for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  -- Same request UUID can be safely retried after a network interruption.
  select * into v_previous from public.reposita_movements where id = p_request;
  if found then
    if v_previous.user_id <> v_user or v_previous.product_id <> p_product
      or v_previous.kind <> p_kind or v_previous.quantity <> p_quantity
      or v_previous.unit_cost <> p_cost or v_previous.unit_price <> p_price
      or v_previous.note <> coalesce(p_note, '') then
      raise exception 'Identificador de movimentação já utilizado.';
    end if;
    return p_request;
  end if;
  if not v_product.active then raise exception 'Produto arquivado.'; end if;
  if p_kind is null or p_kind not in ('purchase', 'sale', 'adjustment_in', 'adjustment_out')
    or p_quantity is null or p_quantity <= 0 then raise exception 'Tipo ou quantidade inválida.'; end if;
  v_delta := case when p_kind in ('purchase', 'adjustment_in') then p_quantity else -p_quantity end;
  if v_product.stock + v_delta < 0 then raise exception 'Estoque insuficiente.'; end if;
  insert into public.reposita_movements(id, user_id, product_id, kind, quantity, unit_cost, unit_price, note)
    values(p_request, v_user, p_product, p_kind, p_quantity, p_cost, p_price, coalesce(p_note, ''));
  update public.reposita_products set stock = stock + v_delta, updated_at = now() where id = p_product;
  return p_request;
end;
$$;
create function public.reposita_archive_product(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_stock integer;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  select stock into v_stock from public.reposita_products where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  if v_stock <> 0 then raise exception 'Zere o saldo com uma movimentação antes de arquivar.'; end if;
  update public.reposita_products set active = false, updated_at = now() where id = p_id;
end;
$$;
revoke all on function public.reposita_save_product(uuid,jsonb) from public, anon;
revoke all on function public.reposita_move_stock(uuid,uuid,text,integer,numeric,numeric,text) from public, anon;
revoke all on function public.reposita_archive_product(uuid) from public, anon;
grant execute on function public.reposita_save_product(uuid,jsonb) to authenticated;
grant execute on function public.reposita_move_stock(uuid,uuid,text,integer,numeric,numeric,text) to authenticated;
grant execute on function public.reposita_archive_product(uuid) to authenticated;
commit;

-- Additive upgrade. Apply after the base migration (and preferably 002).
-- Does not reprice historic sales or modify past quantities.
begin;
create or replace function public.reposita_move_stock(p_request uuid,p_product uuid,p_kind text,p_quantity integer,p_cost numeric,p_price numeric,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_product public.reposita_products%rowtype;v_previous public.reposita_movements%rowtype;v_delta integer;v_cost numeric;
begin
 if v_user is null then raise exception 'Autenticação obrigatória.';end if;
 select * into v_product from public.reposita_products where id=p_product and user_id=v_user for update;
 if not found then raise exception 'Produto não encontrado.';end if;
 select * into v_previous from public.reposita_movements where id=p_request;
 if found then
  if v_previous.user_id<>v_user or v_previous.product_id<>p_product or v_previous.kind<>p_kind or v_previous.quantity<>p_quantity
   or v_previous.unit_cost<>p_cost or v_previous.unit_price<>p_price or v_previous.note<>coalesce(p_note,'') then raise exception 'Identificador de movimentação já utilizado.';end if;
  return p_request;
 end if;
 if not v_product.active then raise exception 'Produto arquivado.';end if;
 if p_kind is null or p_kind not in('purchase','sale','adjustment_in','adjustment_out') or p_quantity is null or p_quantity<=0 then raise exception 'Tipo ou quantidade inválida.';end if;
 v_delta:=case when p_kind in('purchase','adjustment_in') then p_quantity else -p_quantity end;
 if v_product.stock+v_delta<0 then raise exception 'Estoque insuficiente.';end if;
 v_cost:=v_product.cost;
 if p_kind='purchase' then v_cost:=round((v_product.stock*v_product.cost+p_quantity*p_cost)/(v_product.stock+p_quantity),2);end if;
 insert into public.reposita_movements(id,user_id,product_id,kind,quantity,unit_cost,unit_price,note)
 values(p_request,v_user,p_product,p_kind,p_quantity,p_cost,p_price,coalesce(p_note,''));
 update public.reposita_products set stock=stock+v_delta,cost=v_cost,updated_at=now() where id=p_product;
 return p_request;
end;$$;

create table if not exists public.reposita_demands(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid,label text not null check(length(btrim(label)) between 1 and 160),variant text not null default '' check(length(variant)<=80),
 reason text not null check(reason in('missing','out_of_stock','variant','price','delivery')),
 quantity integer not null check(quantity between 1 and 1000),budget numeric(12,2) check(budget>=0 and budget<=1000000 and budget<>'NaN'::numeric),
 note text not null default '' check(length(note)<=500),contact text not null default '' check(length(contact)<=160),
 contact_consent boolean not null default false,consent_at timestamptz,
 source text not null default 'manual' check(source in('manual','public')),
 status text not null default 'new' check(status in('new','reviewing','contacted','closed','ignored')),
 client_hash text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(product_id,user_id) references public.reposita_products(id,user_id),
 check(contact='' or (contact_consent and consent_at is not null))
);
create index if not exists reposita_demands_owner on public.reposita_demands(user_id,created_at desc);
create index if not exists reposita_demands_public_limits on public.reposita_demands(user_id,client_hash,created_at desc) where source='public';
create table if not exists public.reposita_public_stores(
 id uuid primary key default gen_random_uuid(),user_id uuid not null unique references auth.users(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 80),public_token uuid not null unique default gen_random_uuid(),
 enabled boolean not null default false,created_at timestamptz not null default now()
);
create table if not exists public.reposita_purchase_tests(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,product_id uuid not null,
 demand_key text not null default '' check(length(demand_key)<=300),title text not null check(length(btrim(title)) between 1 and 160),
 quantity integer not null check(quantity between 1 and 10000),unit_cost numeric(12,2) not null check(unit_cost>=0 and unit_cost<>'NaN'::numeric),
 freight numeric(12,2) not null default 0 check(freight>=0 and freight<>'NaN'::numeric),packaging numeric(12,2) not null default 0 check(packaging>=0 and packaging<>'NaN'::numeric),
 sale_price numeric(12,2) not null check(sale_price>0 and sale_price<>'NaN'::numeric),fee numeric(6,2) not null default 0 check(fee>=0 and fee<>'NaN'::numeric),
 tax numeric(6,2) not null default 0 check(tax>=0 and tax<>'NaN'::numeric),expected_units integer not null check(expected_units between 0 and 100000),
 days integer not null check(days between 1 and 365),note text not null default '' check(length(note)<=500),
 status text not null default 'planned' check(status in('planned','purchased','completed','canceled')),
 started_at timestamptz,finished_at timestamptz,outcome_note text not null default '' check(length(outcome_note)<=500),created_at timestamptz not null default now(),
 foreign key(product_id,user_id) references public.reposita_products(id,user_id),check(fee+tax<100)
);
create index if not exists reposita_tests_owner on public.reposita_purchase_tests(user_id,created_at desc);
alter table public.reposita_demands enable row level security;
alter table public.reposita_public_stores enable row level security;
alter table public.reposita_purchase_tests enable row level security;
drop policy if exists reposita_demands_own on public.reposita_demands;
drop policy if exists reposita_stores_own on public.reposita_public_stores;
drop policy if exists reposita_tests_own on public.reposita_purchase_tests;
create policy reposita_demands_own on public.reposita_demands for select to authenticated using(user_id=(select auth.uid()));
create policy reposita_stores_own on public.reposita_public_stores for select to authenticated using(user_id=(select auth.uid()));
create policy reposita_tests_own on public.reposita_purchase_tests for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.reposita_demands,public.reposita_public_stores,public.reposita_purchase_tests from anon,authenticated;
grant select on public.reposita_demands,public.reposita_public_stores,public.reposita_purchase_tests to authenticated;
grant all on public.reposita_demands,public.reposita_public_stores,public.reposita_purchase_tests to service_role;

create or replace function public.reposita_save_demand(p_id uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_owner uuid;v_contact text:=btrim(coalesce(p_input->>'contact',''));v_consent boolean:=coalesce((p_input->>'contact_consent')::boolean,false);
begin
 if v_user is null then raise exception 'Autenticação obrigatória.';end if;
 if v_contact<>'' and not v_consent then raise exception 'É necessária autorização para registrar contato.';end if;
 select user_id into v_owner from public.reposita_demands where id=p_id for update;
 if found and v_owner<>v_user then raise exception 'Registro não encontrado.';end if;
 insert into public.reposita_demands(id,user_id,product_id,label,variant,reason,quantity,budget,note,contact,contact_consent,consent_at)
 values(p_id,v_user,nullif(p_input->>'product_id','')::uuid,btrim(p_input->>'label'),coalesce(p_input->>'variant',''),p_input->>'reason',(p_input->>'quantity')::integer,
 nullif(p_input->>'budget','')::numeric,coalesce(p_input->>'note',''),v_contact,v_consent,case when v_consent then now() end)
 on conflict(id) do update set product_id=excluded.product_id,label=excluded.label,variant=excluded.variant,reason=excluded.reason,
 quantity=excluded.quantity,budget=excluded.budget,note=excluded.note,contact=excluded.contact,contact_consent=excluded.contact_consent,
 consent_at=case when public.reposita_demands.contact=excluded.contact and public.reposita_demands.contact_consent and excluded.contact_consent then public.reposita_demands.consent_at else excluded.consent_at end,updated_at=now()
 where public.reposita_demands.user_id=v_user;
 if not found then raise exception 'Registro não encontrado.';end if;
 return p_id;
end;$$;
create or replace function public.reposita_demand_action(p_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória.';end if;
 if p_action='forget_contact' then update public.reposita_demands set contact='',contact_consent=false,consent_at=null,updated_at=now() where id=p_id and user_id=auth.uid();
 elsif p_action in('new','reviewing','contacted','closed','ignored') then update public.reposita_demands set status=p_action,updated_at=now() where id=p_id and user_id=auth.uid();
 else raise exception 'Ação inválida.';end if;
 if not found then raise exception 'Registro não encontrado.';end if;
end;$$;
create or replace function public.reposita_save_public_store(p_name text,p_enabled boolean,p_rotate boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_token uuid;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória.';end if;
 insert into public.reposita_public_stores(user_id,name,enabled) values(auth.uid(),btrim(p_name),p_enabled)
 on conflict(user_id) do update set name=excluded.name,enabled=excluded.enabled,public_token=case when p_rotate then gen_random_uuid() else public.reposita_public_stores.public_token end returning public_token into v_token;
 return v_token;
end;$$;
create or replace function public.reposita_public_store_info(p_token uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',name,'public_token',public_token,'enabled',true) from public.reposita_public_stores where public_token=p_token and enabled;
$$;
-- This ingestion function is intentionally NOT callable with the browser anon key.
create or replace function public.reposita_submit_public_demand(p_request uuid,p_token uuid,p_input jsonb,p_fingerprint text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_store public.reposita_public_stores%rowtype;v_contact text:=btrim(coalesce(p_input->>'contact',''));v_consent boolean:=coalesce((p_input->>'contact_consent')::boolean,false);v_previous public.reposita_demands%rowtype;
begin
 select * into v_store from public.reposita_public_stores where public_token=p_token and enabled for update;
 if not found then raise exception 'Loja indisponível.';end if;
 if p_fingerprint is null or length(p_fingerprint)<>64 then raise exception 'Verificação inválida.';end if;
 select * into v_previous from public.reposita_demands where id=p_request;
 if found then
  if v_previous.user_id<>v_store.user_id or v_previous.source<>'public' or v_previous.client_hash is distinct from p_fingerprint then raise exception 'Requisição inválida.';end if;
  return p_request;
 end if;
 if (select count(*) from public.reposita_demands where user_id=v_store.user_id and source='public' and client_hash=p_fingerprint and created_at>now()-interval '1 hour')>=10
 or (select count(*) from public.reposita_demands where user_id=v_store.user_id and source='public' and created_at>now()-interval '24 hours')>=200 then raise exception 'Limite de solicitações atingido. Tente mais tarde.';end if;
 if v_contact<>'' and not v_consent then raise exception 'Autorização de contato necessária.';end if;
 -- Repeated interest from the same hashed connection in a short window is one signal.
 if exists(select 1 from public.reposita_demands where user_id=v_store.user_id and source='public' and client_hash=p_fingerprint
 and lower(label)=lower(btrim(p_input->>'label')) and variant=coalesce(p_input->>'variant','') and created_at>now()-interval '15 minutes') then raise exception 'Seu interesse neste produto já foi registrado recentemente.';end if;
 insert into public.reposita_demands(id,user_id,label,variant,reason,quantity,budget,note,contact,contact_consent,consent_at,source,client_hash)
 values(p_request,v_store.user_id,btrim(p_input->>'label'),coalesce(p_input->>'variant',''),'missing',(p_input->>'quantity')::integer,nullif(p_input->>'budget','')::numeric,
 coalesce(p_input->>'note',''),v_contact,v_consent,case when v_consent then now() end,'public',p_fingerprint);
 return p_request;
end;$$;

create or replace function public.reposita_save_purchase_test(p_id uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_old public.reposita_purchase_tests%rowtype;
begin
 if v_user is null then raise exception 'Autenticação obrigatória.';end if;
 select * into v_old from public.reposita_purchase_tests where id=p_id for update;
 if found and (v_old.user_id<>v_user or v_old.status<>'planned') then raise exception 'Teste não editável.';end if;
 insert into public.reposita_purchase_tests(id,user_id,product_id,demand_key,title,quantity,unit_cost,freight,packaging,sale_price,fee,tax,expected_units,days,note)
 values(p_id,v_user,(p_input->>'product_id')::uuid,coalesce(p_input->>'demand_key',''),btrim(p_input->>'title'),(p_input->>'quantity')::integer,(p_input->>'unit_cost')::numeric,
 (p_input->>'freight')::numeric,(p_input->>'packaging')::numeric,(p_input->>'sale_price')::numeric,(p_input->>'fee')::numeric,(p_input->>'tax')::numeric,(p_input->>'expected_units')::integer,(p_input->>'days')::integer,coalesce(p_input->>'note',''))
 on conflict(id) do update set product_id=excluded.product_id,demand_key=excluded.demand_key,title=excluded.title,quantity=excluded.quantity,unit_cost=excluded.unit_cost,
 freight=excluded.freight,packaging=excluded.packaging,sale_price=excluded.sale_price,fee=excluded.fee,tax=excluded.tax,expected_units=excluded.expected_units,days=excluded.days,note=excluded.note
 where public.reposita_purchase_tests.user_id=v_user and public.reposita_purchase_tests.status='planned';
 if not found then raise exception 'Teste não editável.';end if;return p_id;
end;$$;
create or replace function public.reposita_purchase_test_action(p_id uuid,p_action text,p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare v_test public.reposita_purchase_tests%rowtype;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória.';end if;
 select * into v_test from public.reposita_purchase_tests where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Teste não encontrado.';end if;
 if p_action='purchase' then
  if v_test.status in('purchased','completed') then return;end if;
  if v_test.status<>'planned' then raise exception 'Teste cancelado.';end if;
  perform public.reposita_move_stock(p_id,v_test.product_id,'purchase',v_test.quantity,round(v_test.unit_cost+v_test.freight/v_test.quantity,2),v_test.sale_price,'Teste de compra: '||v_test.title);
  update public.reposita_purchase_tests set status='purchased',started_at=now() where id=p_id;
 elsif p_action='complete' and v_test.status='purchased' then update public.reposita_purchase_tests set status='completed',finished_at=now(),outcome_note=coalesce(p_note,'') where id=p_id;
 elsif p_action='cancel' and v_test.status='planned' then update public.reposita_purchase_tests set status='canceled',outcome_note=coalesce(p_note,'') where id=p_id;
 else raise exception 'Esta ação não é permitida no estado atual do teste.';end if;
end;$$;
revoke all on function public.reposita_save_demand(uuid,jsonb),public.reposita_demand_action(uuid,text),public.reposita_save_public_store(text,boolean,boolean),public.reposita_save_purchase_test(uuid,jsonb),public.reposita_purchase_test_action(uuid,text,text) from public,anon;
grant execute on function public.reposita_save_demand(uuid,jsonb),public.reposita_demand_action(uuid,text),public.reposita_save_public_store(text,boolean,boolean),public.reposita_save_purchase_test(uuid,jsonb),public.reposita_purchase_test_action(uuid,text,text) to authenticated;
revoke all on function public.reposita_public_store_info(uuid) from public;
grant execute on function public.reposita_public_store_info(uuid) to anon,authenticated;
revoke all on function public.reposita_submit_public_demand(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.reposita_submit_public_demand(uuid,uuid,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;

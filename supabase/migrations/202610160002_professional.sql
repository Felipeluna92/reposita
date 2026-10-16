-- Run AFTER 202610160001_reposita.sql. Additive upgrade: preserves all records.
begin;
alter table public.reposita_products
  add column if not exists description text not null default '' check(length(description)<=2000),
  add column if not exists barcode text not null default '' check(length(barcode)<=80),
  add column if not exists supplier text not null default '' check(length(supplier)<=160),
  add column if not exists location text not null default '' check(length(location)<=160),
  add column if not exists image_path text check(length(image_path)<=240);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('reposita-products','reposita-products',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists reposita_images_read on storage.objects;
drop policy if exists reposita_images_insert on storage.objects;
drop policy if exists reposita_images_delete on storage.objects;
create policy reposita_images_read on storage.objects for select to authenticated
  using(bucket_id='reposita-products' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy reposita_images_insert on storage.objects for insert to authenticated
  with check(bucket_id='reposita-products' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy reposita_images_delete on storage.objects for delete to authenticated
  using(bucket_id='reposita-products' and (storage.foldername(name))[1]=(select auth.uid())::text);

create or replace function public.reposita_save_product(p_id uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid(); v_id uuid; v_image text;
  v_stock integer := coalesce((p_input->>'initial_stock')::integer,0);
begin
  if v_user is null then raise exception 'Autenticação obrigatória.'; end if;
  v_image := nullif(p_input->>'image_path','');
  if v_image is not null and (
    split_part(v_image,'/',1)<>v_user::text or
    v_image !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(webp|png|jpe?g)$' or
    not exists(select 1 from storage.objects where bucket_id='reposita-products' and name=v_image)
  ) then raise exception 'A foto precisa pertencer à sua conta e ter sido enviada ao Storage.'; end if;
  if p_id is null then
    insert into public.reposita_products(user_id,name,sku,category,stock,min_stock,cost,price,description,barcode,supplier,location,image_path)
    values(v_user,btrim(p_input->>'name'),btrim(coalesce(p_input->>'sku','')),coalesce(nullif(btrim(p_input->>'category'),''),'Geral'),v_stock,
      (p_input->>'min_stock')::integer,(p_input->>'cost')::numeric,(p_input->>'price')::numeric,
      coalesce(p_input->>'description',''),coalesce(p_input->>'barcode',''),coalesce(p_input->>'supplier',''),coalesce(p_input->>'location',''),v_image)
    returning id into v_id;
    if v_stock>0 then insert into public.reposita_movements(user_id,product_id,kind,quantity,unit_cost,unit_price,note)
      values(v_user,v_id,'adjustment_in',v_stock,(p_input->>'cost')::numeric,(p_input->>'price')::numeric,'Saldo inicial'); end if;
  else
    update public.reposita_products set name=btrim(p_input->>'name'),sku=btrim(coalesce(p_input->>'sku','')),
      category=coalesce(nullif(btrim(p_input->>'category'),''),'Geral'),min_stock=(p_input->>'min_stock')::integer,
      cost=(p_input->>'cost')::numeric,price=(p_input->>'price')::numeric,
      description=coalesce(p_input->>'description',description),barcode=coalesce(p_input->>'barcode',barcode),
      supplier=coalesce(p_input->>'supplier',supplier),location=coalesce(p_input->>'location',location),
      image_path=case when p_input?'image_path' then v_image else image_path end,updated_at=now()
    where id=p_id and user_id=v_user and active returning id into v_id;
    if v_id is null then raise exception 'Produto não encontrado.'; end if;
  end if;
  return v_id;
end;
$$;
create or replace function public.reposita_restore_product(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  update public.reposita_products set active=true,updated_at=now() where id=p_id and user_id=auth.uid();
  if not found then raise exception 'Produto não encontrado.'; end if;
end;
$$;
create table if not exists public.reposita_imports(
  id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,completed boolean not null default false,created_at timestamptz not null default now()
);
alter table public.reposita_imports enable row level security;
drop policy if exists reposita_imports_own on public.reposita_imports;
create policy reposita_imports_own on public.reposita_imports for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.reposita_imports from anon,authenticated;
grant select on public.reposita_imports to authenticated;
create or replace function public.reposita_import_products(p_request uuid,p_items jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_batch public.reposita_imports%rowtype;v_item jsonb;
begin
  if v_user is null then raise exception 'Autenticação obrigatória.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Envie entre 1 e 200 produtos.'; end if;
  insert into public.reposita_imports(id,user_id,payload) values(p_request,v_user,p_items) on conflict(id) do nothing;
  select * into v_batch from public.reposita_imports where id=p_request for update;
  if v_batch.user_id<>v_user or v_batch.payload<>p_items then raise exception 'Identificador de importação já utilizado.'; end if;
  if v_batch.completed then return jsonb_array_length(p_items); end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    perform public.reposita_save_product(null,v_item);
  end loop;
  update public.reposita_imports set completed=true where id=p_request;
  return jsonb_array_length(p_items);
end;
$$;
revoke all on function public.reposita_restore_product(uuid) from public,anon;
revoke all on function public.reposita_import_products(uuid,jsonb) from public,anon;
grant execute on function public.reposita_restore_product(uuid) to authenticated;
grant execute on function public.reposita_import_products(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

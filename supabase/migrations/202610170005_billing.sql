-- Reposita subscriptions. Apply after 001-004. Additive; billing starts disabled.
begin;
create table if not exists public.reposita_billing_settings(id boolean primary key default true check(id),enabled boolean not null default false,mode text not null default 'test' check(mode in('test','live')),trial_days integer not null default 7 check(trial_days between 1 and 30),trial_products integer not null default 50 check(trial_products between 1 and 500),activated_at timestamptz,support_email text not null default '' check(length(support_email)<=160));
insert into public.reposita_billing_settings(id) values(true) on conflict do nothing;
create table if not exists public.reposita_billing_plans(code text primary key,name text not null,amount_cents integer not null check(amount_cents>0),currency text not null default 'brl' check(currency='brl'),product_limit integer not null check(product_limit>0),active boolean not null default true,sort_order integer not null);
insert into public.reposita_billing_plans(code,name,amount_cents,product_limit,sort_order) values('essential','Essencial',2990,100,1),('professional','Profissional',5990,1000,2),('business','Negócios',11990,5000,3) on conflict do nothing;
create table if not exists public.reposita_billing_owners(user_id uuid primary key references auth.users(id) on delete cascade);
create table if not exists public.reposita_billing_profiles(user_id uuid primary key references auth.users(id) on delete cascade,trial_ends_at timestamptz not null,created_at timestamptz not null default now());
create table if not exists public.reposita_billing_customers(user_id uuid not null references auth.users(id) on delete cascade,mode text not null check(mode in('test','live')),customer_id text,lease_token uuid,lease_until timestamptz,last_checkout text,window_start timestamptz not null default now(),window_count integer not null default 0,primary key(user_id,mode),unique(mode,customer_id));
create table if not exists public.reposita_billing_prices(mode text not null check(mode in('test','live')),plan_code text not null references public.reposita_billing_plans(code),price_id text not null,product_id text not null,current boolean not null default true,primary key(mode,price_id));
create table if not exists public.reposita_billing_private(mode text primary key check(mode in('test','live')),endpoint_id text not null,webhook_secret text not null,portal_id text not null,account_id text not null,charges_enabled boolean not null default false,last_webhook_at timestamptz);
create table if not exists public.reposita_billing_subscriptions(user_id uuid not null,mode text not null,subscription_id text not null,customer_id text not null,plan_code text references public.reposita_billing_plans(code),status text not null,period_end timestamptz,cancel_at_period_end boolean not null default false,observed_at timestamptz not null,primary key(user_id,mode),unique(mode,subscription_id),foreign key(user_id,mode) references public.reposita_billing_customers(user_id,mode) on delete cascade);
create table if not exists public.reposita_billing_events(mode text not null check(mode in('test','live')),event_id text not null,subscription_id text not null,processed_at timestamptz not null default now(),applied boolean not null,payment_verified boolean not null default false,primary key(mode,event_id));
create unique index if not exists reposita_billing_current_price on public.reposita_billing_prices(mode,plan_code) where current;
create index if not exists reposita_billing_test_proof on public.reposita_billing_events(mode) where payment_verified and applied;
do $$declare t text;begin foreach t in array array['reposita_billing_settings','reposita_billing_plans','reposita_billing_owners','reposita_billing_profiles','reposita_billing_customers','reposita_billing_prices','reposita_billing_private','reposita_billing_subscriptions','reposita_billing_events'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end;$$;

create or replace function public.reposita_billing_ensure_profile(p_user uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if p_user is null then raise exception 'Autenticação obrigatória.';end if;
 insert into public.reposita_billing_profiles(user_id,trial_ends_at) select p_user,now()+make_interval(days=>trial_days) from public.reposita_billing_settings where id on conflict do nothing;
end;$$;
create or replace function public.reposita_billing_access(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg public.reposita_billing_settings%rowtype;profile public.reposita_billing_profiles%rowtype;sub public.reposita_billing_subscriptions%rowtype;v_owner boolean;v_trial timestamptz;v_limit integer;v_plan text;v_status text;v_allowed boolean;v_used integer;
begin
 perform public.reposita_billing_ensure_profile(p_user);
 select * into cfg from public.reposita_billing_settings where id;select * into profile from public.reposita_billing_profiles where user_id=p_user;
 select exists(select 1 from public.reposita_billing_owners where user_id=p_user) into v_owner;
 select * into sub from public.reposita_billing_subscriptions where user_id=p_user and mode=cfg.mode;
 v_trial:=greatest(profile.trial_ends_at,coalesce(cfg.activated_at+make_interval(days=>cfg.trial_days),profile.trial_ends_at));
 v_plan:=null;v_limit:=cfg.trial_products;v_status:='expired';v_allowed:=false;
 if v_owner then v_status:='owner';v_limit:=null;v_allowed:=true;
 elsif sub.status in('active','trialing') and sub.period_end>now() and sub.plan_code is not null then
 select product_limit into v_limit from public.reposita_billing_plans where code=sub.plan_code;v_plan:=sub.plan_code;v_status:=sub.status;v_allowed:=v_limit is not null;
 elsif v_trial>now() then v_status:='trial';v_allowed:=true;
 elsif sub.status is not null then v_status:=sub.status;end if;
 if not cfg.enabled then v_allowed:=true;v_limit:=null;if not v_owner then v_status:='setup';end if;end if;
 select count(*) into v_used from public.reposita_products where user_id=p_user and active;
 return jsonb_build_object('has_customer',exists(select 1 from public.reposita_billing_customers where user_id=p_user and mode=cfg.mode and customer_id is not null),'is_owner',v_owner,'allowed',v_allowed,'status',v_status,'plan_code',v_plan,'product_limit',v_limit,'used',v_used,'trial_ends_at',v_trial,'period_end',sub.period_end,'cancel_at_period_end',coalesce(sub.cancel_at_period_end,false));
end;$$;
create or replace function public.reposita_billing_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg public.reposita_billing_settings%rowtype;access jsonb;v_private public.reposita_billing_private%rowtype;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória.';end if;select * into cfg from public.reposita_billing_settings where id;
 access:=public.reposita_billing_access(auth.uid());select * into v_private from public.reposita_billing_private where mode=cfg.mode;
 return jsonb_build_object('settings',jsonb_build_object('enabled',cfg.enabled,'mode',cfg.mode,'trial_days',cfg.trial_days,'trial_products',cfg.trial_products,'support_email',cfg.support_email),'access',access,'owner_setup_needed',not exists(select 1 from public.reposita_billing_owners),'admin',case when (access->>'is_owner')::boolean then jsonb_build_object('ready',v_private.endpoint_id is not null and (select count(*) from public.reposita_billing_prices where mode=cfg.mode and current)=3,'has_webhook',v_private.endpoint_id is not null,'prices_ready',(select count(*) from public.reposita_billing_prices where mode=cfg.mode and current)=3,'charges_enabled',coalesce(v_private.charges_enabled,false),'last_webhook_at',v_private.last_webhook_at,'test_verified',exists(select 1 from public.reposita_billing_events where mode='test' and payment_verified)) else null end);
end;$$;
create or replace function public.reposita_billing_can_write(p_user uuid) returns boolean language plpgsql security definer set search_path='' as $$begin if auth.uid() is not null and auth.uid()<>p_user then raise exception 'Conta não autorizada.';end if;return coalesce((public.reposita_billing_access(p_user)->>'allowed')::boolean,false);end;$$;
create or replace function public.reposita_billing_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;access jsonb;v_limit integer;v_count integer;
begin
 target:=case when tg_op='DELETE' then old.user_id else new.user_id end;
 if tg_op='UPDATE' and new.user_id<>old.user_id then raise exception 'Proprietário não pode ser alterado.';end if;
 if tg_table_name='reposita_demands' and tg_op='UPDATE' then
  if new.contact='' and not new.contact_consent and new.consent_at is null and (to_jsonb(new)-array['contact','contact_consent','consent_at','updated_at'])=(to_jsonb(old)-array['contact','contact_consent','consent_at','updated_at']) then return new;end if;
 end if;
 perform public.reposita_billing_ensure_profile(target);perform 1 from public.reposita_billing_profiles where user_id=target for update;
 access:=public.reposita_billing_access(target);
 if not (access->>'allowed')::boolean then if tg_table_name='reposita_demands' and auth.uid() is null then raise exception 'Loja indisponível.';else raise exception 'Assinatura necessária para continuar. Consulte Planos e assinatura.';end if;end if;
 if tg_table_name='reposita_products' and tg_op<>'DELETE' then
  if new.active and (tg_op='INSERT' or not old.active) then
   v_limit:=(access->>'product_limit')::integer;
   if v_limit is not null then select count(*) into v_count from public.reposita_products where user_id=target and active and id<>new.id;
    if v_count>=v_limit then raise exception 'Limite de % produtos ativos atingido. Arquive itens sem saldo ou altere seu plano.',v_limit;end if;
   end if;
  end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
do $$declare t text;begin foreach t in array array['reposita_products','reposita_movements','reposita_imports','reposita_demands','reposita_public_stores','reposita_purchase_tests'] loop execute format('drop trigger if exists reposita_billing_guard on public.%I',t);execute format('create trigger reposita_billing_guard before insert or update or delete on public.%I for each row execute function public.reposita_billing_guard()',t);end loop;end;$$;
drop policy if exists reposita_billing_upload on storage.objects;
create policy reposita_billing_upload on storage.objects as restrictive for insert to authenticated with check(bucket_id not in('reposita-products','reposita-store-pages') or public.reposita_billing_can_write((select auth.uid())));

create or replace function public.reposita_billing_lock(p_user uuid,p_mode text,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.reposita_billing_customers%rowtype;
begin
 perform public.reposita_billing_ensure_profile(p_user);
 insert into public.reposita_billing_customers(user_id,mode) values(p_user,p_mode) on conflict do nothing;
 select * into row from public.reposita_billing_customers where user_id=p_user and mode=p_mode for update;
 if row.lease_until>now() and row.lease_token is distinct from p_token then raise exception 'Aguarde a operação anterior terminar.';end if;
 if row.window_start>now()-interval '1 minute' and row.window_count>=12 then raise exception 'Muitas operações. Tente novamente em um minuto.';end if;
 update public.reposita_billing_customers set lease_token=p_token,lease_until=now()+interval '2 minutes',window_start=case when row.window_start>now()-interval '1 minute' then row.window_start else now() end,window_count=case when row.window_start>now()-interval '1 minute' then row.window_count+1 else 1 end where user_id=p_user and mode=p_mode;
 return to_jsonb(row);
end;$$;
create or replace function public.reposita_billing_release(p_user uuid,p_mode text,p_token uuid) returns void language sql security definer set search_path='' as $$update public.reposita_billing_customers set lease_until=null,lease_token=null where user_id=p_user and mode=p_mode and lease_token=p_token;$$;
create or replace function public.reposita_billing_save_setup(p_mode text,p_prices jsonb,p_hook text,p_secret text,p_portal text,p_account text,p_charges boolean,p_email text) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb;
begin
 if length(p_email)>160 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Informe um e-mail público de suporte válido.';end if;
 if jsonb_array_length(p_prices)<>3 or p_secret not like 'whsec_%' then raise exception 'Configuração incompleta.';end if;
 update public.reposita_billing_prices set current=false where mode=p_mode;
 for item in select value from jsonb_array_elements(p_prices) loop
 insert into public.reposita_billing_prices(mode,plan_code,price_id,product_id,current) values(p_mode,item->>'code',item->>'price_id',item->>'product_id',true) on conflict(mode,price_id) do update set product_id=excluded.product_id,current=true;
 end loop;
 insert into public.reposita_billing_private(mode,endpoint_id,webhook_secret,portal_id,account_id,charges_enabled) values(p_mode,p_hook,p_secret,p_portal,p_account,p_charges) on conflict(mode) do update set endpoint_id=excluded.endpoint_id,webhook_secret=excluded.webhook_secret,portal_id=excluded.portal_id,account_id=excluded.account_id,charges_enabled=excluded.charges_enabled;
 update public.reposita_billing_settings set enabled=case when mode=p_mode then enabled else false end,mode=p_mode,support_email=p_email where id;
end;$$;
create or replace function public.reposita_billing_set_enabled(p_enabled boolean) returns void language sql security definer set search_path='' as $$ update public.reposita_billing_settings set enabled=p_enabled,activated_at=case when p_enabled then coalesce(activated_at,now()) else activated_at end where id; $$;
create or replace function public.reposita_billing_apply_subscription(p_user uuid,p_mode text,p_event text,p_subscription text,p_customer text,p_price text,p_status text,p_end timestamptz,p_cancel boolean,p_observed timestamptz,p_payment_verified boolean default false) returns boolean language plpgsql security definer set search_path='' as $$
declare v_existing public.reposita_billing_subscriptions%rowtype;v_plan text;v_applied boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('reposita-sub:'||p_mode||':'||p_user::text,0));
 if exists(select 1 from public.reposita_billing_events where mode=p_mode and event_id=p_event) then return false;end if;
 if not exists(select 1 from public.reposita_billing_customers where user_id=p_user and mode=p_mode and customer_id=p_customer) then raise exception 'Cliente de pagamento não corresponde à conta.';end if;
 select plan_code into v_plan from public.reposita_billing_prices where mode=p_mode and price_id=p_price;
 select * into v_existing from public.reposita_billing_subscriptions where user_id=p_user and mode=p_mode;
 v_applied:=v_existing.observed_at is null or v_existing.observed_at<=p_observed;
 if v_applied then
 insert into public.reposita_billing_subscriptions(user_id,mode,subscription_id,customer_id,plan_code,status,period_end,cancel_at_period_end,observed_at) values(p_user,p_mode,p_subscription,p_customer,v_plan,p_status,p_end,p_cancel,p_observed) on conflict(user_id,mode) do update set subscription_id=excluded.subscription_id,customer_id=excluded.customer_id,plan_code=excluded.plan_code,status=excluded.status,period_end=excluded.period_end,cancel_at_period_end=excluded.cancel_at_period_end,observed_at=excluded.observed_at;
 end if;
 insert into public.reposita_billing_events(mode,event_id,subscription_id,applied,payment_verified) values(p_mode,p_event,p_subscription,v_applied,p_payment_verified and p_event like 'evt_%');
 return v_applied;
end;$$;
-- Only the authenticated state and storage guard can be called by a browser.
revoke all on function public.reposita_billing_guard(),public.reposita_billing_set_enabled(boolean),public.reposita_billing_ensure_profile(uuid),public.reposita_billing_access(uuid),public.reposita_billing_can_write(uuid),public.reposita_billing_state(),public.reposita_billing_lock(uuid,text,uuid),public.reposita_billing_release(uuid,text,uuid),public.reposita_billing_save_setup(text,jsonb,text,text,text,text,boolean,text),public.reposita_billing_apply_subscription(uuid,text,text,text,text,text,text,timestamptz,boolean,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.reposita_billing_state(),public.reposita_billing_can_write(uuid) to authenticated;
grant execute on function public.reposita_billing_set_enabled(boolean),public.reposita_billing_ensure_profile(uuid),public.reposita_billing_access(uuid),public.reposita_billing_lock(uuid,text,uuid),public.reposita_billing_release(uuid,text,uuid),public.reposita_billing_save_setup(text,jsonb,text,text,text,text,boolean,text),public.reposita_billing_apply_subscription(uuid,text,text,text,text,text,text,timestamptz,boolean,timestamptz,boolean) to service_role;
notify pgrst,'reload schema';
commit;

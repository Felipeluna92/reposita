-- Apply after 001, 002 and 003. Additive and repeatable; keeps tokens and requests.
begin;
create or replace function public.reposita_valid_page_settings(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;v jsonb;maxlen integer;seen text[]:=array[]::text[];
begin
 if p='{}'::jsonb then return true;end if;
 if jsonb_typeof(p)<>'object' or octet_length(p::text)>12000 then return false;end if;
 if exists(select 1 from jsonb_object_keys(p) key where key not in('version','layout','theme','font','background','surface','text','primary','eyebrow','headline','description','form_title','form_description','button','success_title','success_message','footer','privacy_note','logo_path','cover_path','fields','questions')) then return false;end if;
 if p->>'version' is distinct from '1' or coalesce(p->>'layout','') not in('split','centered') or coalesce(p->>'theme','') not in('light','dark') or coalesce(p->>'font','') not in('clean','elegant','modern') then return false;end if;
 foreach k in array array['background','surface','text','primary'] loop if jsonb_typeof(p->k) is distinct from 'string' or p->>k !~ '^#[a-fA-F0-9]{6}$' then return false;end if;end loop;
 foreach k in array array['eyebrow','headline','description','form_title','form_description','button','success_title','success_message','footer','privacy_note'] loop
 maxlen:=case k when 'eyebrow' then 100 when 'headline' then 200 when 'description' then 800 when 'form_title' then 100 when 'form_description' then 400 when 'button' then 60 when 'success_title' then 150 when 'footer' then 200 else 500 end;
 if jsonb_typeof(p->k) is distinct from 'string' or length(p->>k)>maxlen then return false;end if;
 if k in('headline','form_title','button','success_title') and btrim(p->>k)='' then return false;end if;end loop;
 foreach k in array array['logo_path','cover_path'] loop if jsonb_typeof(p->k) is distinct from 'string' or (p->>k<>'' and p->>k !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|webp|jpe?g)$') then return false;end if;end loop;
 if jsonb_typeof(p->'fields') is distinct from 'array' or jsonb_array_length(p->'fields')<>6 then return false;end if;
 for v in select value from jsonb_array_elements(p->'fields') loop
 k:=v->>'key';if k is null or k not in('label','variant','quantity','budget','note','contact') or k=any(seen) or jsonb_typeof(v->'label') is distinct from 'string' or length(btrim(v->>'label')) not between 1 and 80 or jsonb_typeof(v->'placeholder') is distinct from 'string' or length(v->>'placeholder')>120 or jsonb_typeof(v->'enabled') is distinct from 'boolean' or jsonb_typeof(v->'required') is distinct from 'boolean' then return false;end if;
 if k='label' and (v->>'enabled'<>'true' or v->>'required'<>'true') then return false;end if;
 if k='contact' and v->>'required'='true' then return false;end if;seen:=array_append(seen,k);end loop;
 if jsonb_typeof(p->'questions') is distinct from 'array' or jsonb_array_length(p->'questions')>3 then return false;end if;
 seen:=array[]::text[];
 for v in select value from jsonb_array_elements(p->'questions') loop
 k:=v->>'id';if k is null or k !~ '^q_[a-z0-9]{1,32}$' or k=any(seen) or jsonb_typeof(v->'label') is distinct from 'string' or length(btrim(v->>'label')) not between 1 and 80 or jsonb_typeof(v->'placeholder') is distinct from 'string' or length(v->>'placeholder')>120 or jsonb_typeof(v->'required') is distinct from 'boolean' then return false;end if;seen:=array_append(seen,k);end loop;
 return true;
end;$$;
alter table public.reposita_public_stores add column if not exists page_settings jsonb not null default '{}'::jsonb check(public.reposita_valid_page_settings(page_settings));
alter table public.reposita_demands add column if not exists custom_answers jsonb not null default '[]'::jsonb check(jsonb_typeof(custom_answers)='array' and jsonb_array_length(custom_answers)<=3 and octet_length(custom_answers::text)<=4000);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('reposita-store-pages','reposita-store-pages',true,614400,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists reposita_page_images_read on storage.objects;drop policy if exists reposita_page_images_insert on storage.objects;drop policy if exists reposita_page_images_delete on storage.objects;
create policy reposita_page_images_read on storage.objects for select to authenticated using(bucket_id='reposita-store-pages' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy reposita_page_images_insert on storage.objects for insert to authenticated with check(bucket_id='reposita-store-pages' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy reposita_page_images_delete on storage.objects for delete to authenticated using(bucket_id='reposita-store-pages' and (storage.foldername(name))[1]=(select auth.uid())::text);
create or replace function public.reposita_customize_public_store(p_name text,p_settings jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();k text;v_path text;v_token uuid;
begin
 if v_user is null then raise exception 'Autenticação obrigatória.';end if;
 if not public.reposita_valid_page_settings(p_settings) then raise exception 'Configuração de página inválida.';end if;
 foreach k in array array['logo_path','cover_path'] loop v_path:=p_settings->>k;if coalesce(v_path,'')<>'' and (split_part(v_path,'/',1)<>v_user::text or not exists(select 1 from storage.objects where bucket_id='reposita-store-pages' and name=v_path)) then raise exception 'A imagem precisa pertencer à sua conta.';end if;end loop;
 insert into public.reposita_public_stores(user_id,name,page_settings) values(v_user,btrim(p_name),p_settings) on conflict(user_id) do update set name=excluded.name,page_settings=excluded.page_settings returning public_token into v_token;
 return v_token;
end;$$;
create or replace function public.reposita_public_store_info(p_token uuid) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('name',name,'public_token',public_token,'enabled',true,'page_settings',page_settings) from public.reposita_public_stores where public_token=p_token and enabled;$$;
create or replace function public.reposita_prepare_public_input(p_settings jsonb,p_input jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb:=p_input;f jsonb;q jsonb;a jsonb;answers jsonb:='[]'::jsonb;v text;k text;
begin
 for f in select value from jsonb_array_elements(coalesce(p_settings->'fields','[]'::jsonb)) loop
 k:=f->>'key';if f->>'enabled'='false' then result:=jsonb_set(result,array[k],case k when 'quantity' then '1'::jsonb when 'budget' then 'null'::jsonb else '""'::jsonb end);
 elsif f->>'required'='true' and (result->k is null or result->k='null'::jsonb or btrim(result->>k)='') then raise exception 'Campo obrigatório não preenchido.';end if;end loop;
 if result->>'contact'='' then result:=jsonb_set(result,'{contact_consent}','false'::jsonb);end if;
 if jsonb_typeof(coalesce(result->'custom_answers','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(result->'custom_answers','[]'::jsonb))>3 then raise exception 'Resposta adicional inválida.';end if;
 for a in select value from jsonb_array_elements(coalesce(result->'custom_answers','[]'::jsonb)) loop
 if not exists(select 1 from jsonb_array_elements(coalesce(p_settings->'questions','[]'::jsonb)) question where question->>'id'=a->>'id') or jsonb_typeof(a->'value') is distinct from 'string' or length(a->>'value')>240 then raise exception 'Resposta adicional inválida.';end if;
 if (select count(*) from jsonb_array_elements(result->'custom_answers') answer where answer->>'id'=a->>'id')>1 then raise exception 'Resposta adicional duplicada.';end if;end loop;
 for q in select value from jsonb_array_elements(coalesce(p_settings->'questions','[]'::jsonb)) loop
 select btrim(answer->>'value') into v from jsonb_array_elements(coalesce(result->'custom_answers','[]'::jsonb)) answer where answer->>'id'=q->>'id';
 if coalesce(v,'')='' and q->>'required'='true' then raise exception 'Campo obrigatório não preenchido.';end if;
 if coalesce(v,'')<>'' then answers:=answers||jsonb_build_array(jsonb_build_object('id',q->>'id','label',q->>'label','value',v));end if;end loop;
 return jsonb_set(result,'{custom_answers}',answers);
end;$$;
create or replace function public.reposita_submit_public_demand(p_request uuid,p_token uuid,p_input jsonb,p_fingerprint text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_store public.reposita_public_stores%rowtype;v_input jsonb;v_contact text;v_consent boolean;v_previous public.reposita_demands%rowtype;
begin
 select * into v_store from public.reposita_public_stores where public_token=p_token and enabled for update;if not found then raise exception 'Loja indisponível.';end if;
 if p_fingerprint is null or length(p_fingerprint)<>64 then raise exception 'Verificação inválida.';end if;
 select * into v_previous from public.reposita_demands where id=p_request;
 if found then if v_previous.user_id<>v_store.user_id or v_previous.source<>'public' or v_previous.client_hash is distinct from p_fingerprint then raise exception 'Requisição inválida.';end if;return p_request;end if;
 if (select count(*) from public.reposita_demands where user_id=v_store.user_id and source='public' and client_hash=p_fingerprint and created_at>now()-interval '1 hour')>=10 or (select count(*) from public.reposita_demands where user_id=v_store.user_id and source='public' and created_at>now()-interval '24 hours')>=200 then raise exception 'Limite de solicitações atingido. Tente mais tarde.';end if;
 v_input:=public.reposita_prepare_public_input(v_store.page_settings,p_input);v_contact:=btrim(coalesce(v_input->>'contact',''));v_consent:=coalesce((v_input->>'contact_consent')::boolean,false);
 if v_contact<>'' and not v_consent then raise exception 'Autorização de contato necessária.';end if;
 if exists(select 1 from public.reposita_demands where user_id=v_store.user_id and source='public' and client_hash=p_fingerprint and lower(label)=lower(btrim(v_input->>'label')) and variant=coalesce(v_input->>'variant','') and created_at>now()-interval '15 minutes') then raise exception 'Seu interesse neste produto já foi registrado recentemente.';end if;
 insert into public.reposita_demands(id,user_id,label,variant,reason,quantity,budget,note,contact,contact_consent,consent_at,source,client_hash,custom_answers)
 values(p_request,v_store.user_id,btrim(v_input->>'label'),coalesce(v_input->>'variant',''),'missing',(v_input->>'quantity')::integer,nullif(v_input->>'budget','')::numeric,coalesce(v_input->>'note',''),v_contact,v_consent,case when v_consent then now() end,'public',p_fingerprint,v_input->'custom_answers');return p_request;
end;$$;
revoke all on function public.reposita_customize_public_store(text,jsonb) from public,anon;grant execute on function public.reposita_customize_public_store(text,jsonb) to authenticated;
revoke all on function public.reposita_prepare_public_input(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.reposita_submit_public_demand(uuid,uuid,jsonb,text) from public,anon,authenticated;grant execute on function public.reposita_submit_public_demand(uuid,uuid,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;

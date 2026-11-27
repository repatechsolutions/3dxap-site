-- ERP 3DXAP, fase 1: estoque.
-- Rode no SQL Editor do Supabase (projeto da 3dxap). Não altera products,
-- quote_library, label_archive nem as policies antigas.
--
-- Depois crie os usuários em Authentication → Users (senha definida lá, não aqui):
--   pcristinapacheco@gmail.com
--   renanbrmania@gmail.com
-- Confirme o e-mail no painel se a confirmação estiver ligada.
-- Em Authentication → URL configuration, inclua
--   https://www.3dxap.com.br/erp
--   http://localhost:5173/erp
-- para o link mágico voltar ao ERP.

create table if not exists public.erp_operators (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.erp_operators (email) values
  ('pcristinapacheco@gmail.com'),
  ('renanbrmania@gmail.com')
on conflict (email) do nothing;

create sequence if not exists public.stock_barcode_seq as bigint start with 1;

create or replace function public.ean13_check_digit(p_body text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  i int;
  digit int;
  total int := 0;
begin
  if p_body !~ '^[0-9]{12}$' then
    raise exception 'invalid_qty';
  end if;
  for i in 1..12 loop
    digit := substr(p_body, i, 1)::int;
    if i % 2 = 1 then
      total := total + digit;
    else
      total := total + digit * 3;
    end if;
  end loop;
  return ((10 - (total % 10)) % 10)::text;
end;
$$;

create table if not exists public.stock_items (
  id bigint generated always as identity primary key,
  name text not null check (length(btrim(name)) > 0),
  kind text not null check (kind in ('simples', 'pacote')),
  price_cents integer not null check (price_cents >= 0),
  min_qty integer not null default 0 check (min_qty >= 0),
  barcode text not null unique check (
    barcode ~ '^[0-9]{13}$'
    and substr(barcode, 13, 1) = public.ean13_check_digit(substr(barcode, 1, 12))
  ),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_kit_components (
  kit_id bigint not null references public.stock_items (id) on delete cascade,
  component_id bigint not null references public.stock_items (id),
  qty integer not null check (qty > 0),
  primary key (kit_id, component_id),
  check (kit_id <> component_id)
);

create index if not exists stock_kit_components_component_id_idx
  on public.stock_kit_components (component_id);

create table if not exists public.stock_movements (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.stock_items (id),
  kind text not null check (kind in ('entrada', 'saida', 'ajuste', 'montagem')),
  qty integer not null check (
    (kind = 'entrada' and qty > 0)
    or (kind = 'saida' and qty < 0)
    or (kind = 'ajuste' and qty <> 0)
    or (kind = 'montagem' and qty <> 0)
  ),
  note text not null default '',
  actor_email text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_item_id_created_at_idx
  on public.stock_movements (item_id, created_at desc);

create or replace function public.erp_is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.erp_operators o
      where lower(o.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

create or replace function public.stock_require_operator()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.erp_is_operator() then
    raise exception 'not_operator' using errcode = '42501';
  end if;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  return v_email;
end;
$$;

create or replace function public.stock_balance_of(p_item_id bigint)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(sum(qty), 0)::integer
  from public.stock_movements
  where item_id = p_item_id;
$$;

create or replace function public.stock_create_item(
  p_name text,
  p_kind text,
  p_price_cents integer,
  p_min_qty integer,
  p_initial_qty integer,
  p_components jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_body text;
  v_barcode text;
  v_id bigint;
  v_name text;
  v_comp record;
  v_component public.stock_items%rowtype;
begin
  v_email := public.stock_require_operator();
  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'empty_name';
  end if;
  if p_kind not in ('simples', 'pacote')
    or p_price_cents is null or p_price_cents < 0
    or p_min_qty is null or p_min_qty < 0
    or p_initial_qty is null or p_initial_qty < 0 then
    raise exception 'invalid_qty';
  end if;
  if p_kind = 'pacote' and (
    jsonb_typeof(p_components) is distinct from 'array'
    or jsonb_array_length(p_components) = 0
  ) then
    raise exception 'empty_kit';
  end if;

  v_body := '2' || lpad(nextval('public.stock_barcode_seq')::text, 11, '0');
  v_barcode := v_body || public.ean13_check_digit(v_body);

  insert into public.stock_items (name, kind, price_cents, min_qty, barcode)
  values (v_name, p_kind, p_price_cents, p_min_qty, v_barcode)
  returning id into v_id;

  if p_kind = 'pacote' then
    for v_comp in
      select * from jsonb_to_recordset(p_components) as x(component_id bigint, qty integer)
    loop
      if v_comp.component_id is null or v_comp.qty is null or v_comp.qty <= 0 or v_comp.component_id = v_id then
        raise exception 'bad_component';
      end if;
      select * into v_component from public.stock_items where id = v_comp.component_id for update;
      if not found or v_component.kind <> 'simples' then
        raise exception 'bad_component';
      end if;
      insert into public.stock_kit_components (kit_id, component_id, qty)
      values (v_id, v_comp.component_id, v_comp.qty);
    end loop;
  end if;

  if p_initial_qty > 0 then
    insert into public.stock_movements (item_id, kind, qty, note, actor_email)
    values (v_id, 'entrada', p_initial_qty, 'quantidade inicial', v_email);
  end if;

  return jsonb_build_object(
    'id', v_id,
    'name', v_name,
    'kind', p_kind,
    'price_cents', p_price_cents,
    'min_qty', p_min_qty,
    'barcode', v_barcode,
    'balance', public.stock_balance_of(v_id)
  );
end;
$$;

create or replace function public.stock_apply_scan(
  p_barcode text,
  p_mode text,
  p_qty integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_item public.stock_items%rowtype;
  v_balance integer;
  v_signed integer;
  v_kind text;
begin
  v_email := public.stock_require_operator();
  if p_mode not in ('entrada', 'saida', 'ajuste') or p_qty is null or p_qty = 0 then
    raise exception 'invalid_qty';
  end if;
  if p_mode in ('entrada', 'saida') and p_qty < 0 then
    raise exception 'invalid_qty';
  end if;

  select * into v_item
  from public.stock_items
  where barcode = btrim(coalesce(p_barcode, ''))
  for update;
  if not found then
    raise exception 'unknown_barcode' using errcode = 'P0002';
  end if;

  v_balance := public.stock_balance_of(v_item.id);
  if p_mode = 'entrada' then
    v_kind := 'entrada';
    v_signed := p_qty;
  elsif p_mode = 'saida' then
    if v_balance < p_qty then
      raise exception 'insufficient_stock' using errcode = 'P0001';
    end if;
    v_kind := 'saida';
    v_signed := -p_qty;
  else
    if v_balance + p_qty < 0 then
      raise exception 'insufficient_stock' using errcode = 'P0001';
    end if;
    v_kind := 'ajuste';
    v_signed := p_qty;
  end if;

  insert into public.stock_movements (item_id, kind, qty, note, actor_email)
  values (v_item.id, v_kind, v_signed, '', v_email);

  return jsonb_build_object(
    'id', v_item.id,
    'name', v_item.name,
    'kind', v_kind,
    'barcode', v_item.barcode,
    'balance', v_balance + v_signed
  );
end;
$$;

create or replace function public.stock_assemble(p_kit_id bigint, p_kits integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_kit public.stock_items%rowtype;
  v_comp record;
  v_need integer;
  v_balance integer;
begin
  v_email := public.stock_require_operator();
  if p_kits is null or p_kits <= 0 then
    raise exception 'invalid_qty';
  end if;

  perform 1
  from public.stock_items
  where id = p_kit_id
     or id in (select component_id from public.stock_kit_components where kit_id = p_kit_id)
  order by id
  for update;

  select * into v_kit from public.stock_items where id = p_kit_id;
  if not found or v_kit.kind <> 'pacote' then
    raise exception 'bad_component';
  end if;
  if not exists (select 1 from public.stock_kit_components where kit_id = p_kit_id) then
    raise exception 'empty_kit';
  end if;

  for v_comp in
    select * from public.stock_kit_components where kit_id = p_kit_id
  loop
    v_need := v_comp.qty * p_kits;
    v_balance := public.stock_balance_of(v_comp.component_id);
    if v_balance < v_need then
      raise exception 'insufficient_stock' using errcode = 'P0001';
    end if;
    insert into public.stock_movements (item_id, kind, qty, note, actor_email)
    values (v_comp.component_id, 'montagem', -v_need, 'montagem de pacote', v_email);
  end loop;

  insert into public.stock_movements (item_id, kind, qty, note, actor_email)
  values (p_kit_id, 'montagem', p_kits, 'montagem de pacote', v_email);

  return jsonb_build_object(
    'id', v_kit.id,
    'name', v_kit.name,
    'kind', 'montagem',
    'barcode', v_kit.barcode,
    'balance', public.stock_balance_of(p_kit_id)
  );
end;
$$;

create or replace function public.stock_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month timestamptz;
begin
  perform public.stock_require_operator();
  v_month := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'kind', i.kind,
        'price_cents', i.price_cents,
        'min_qty', i.min_qty,
        'barcode', i.barcode,
        'active', i.active,
        'balance', public.stock_balance_of(i.id),
        'components', coalesce((
          select jsonb_agg(jsonb_build_object(
            'component_id', c.component_id,
            'qty', c.qty
          ))
          from public.stock_kit_components c
          where c.kit_id = i.id
        ), '[]'::jsonb)
      ) order by i.name)
      from public.stock_items i
    ), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'item_id', m.item_id,
        'kind', m.kind,
        'qty', m.qty,
        'note', m.note,
        'actor_email', m.actor_email,
        'created_at', m.created_at
      ) order by m.created_at desc)
      from (
        select * from public.stock_movements order by created_at desc limit 40
      ) m
    ), '[]'::jsonb),
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object('item_id', s.item_id, 'qty', s.qty))
      from public.stock_movements s
      where s.kind = 'saida' and s.created_at >= v_month
    ), '[]'::jsonb)
  );
end;
$$;

alter table public.erp_operators enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_kit_components enable row level security;
alter table public.stock_movements enable row level security;

revoke all on table public.erp_operators from public, anon, authenticated;
revoke all on table public.stock_items from public, anon, authenticated;
revoke all on table public.stock_kit_components from public, anon, authenticated;
revoke all on table public.stock_movements from public, anon, authenticated;
revoke all on sequence public.stock_barcode_seq from public, anon, authenticated;

grant select on table public.stock_items to authenticated;
grant select on table public.stock_kit_components to authenticated;
grant select on table public.stock_movements to authenticated;

drop policy if exists stock_items_select on public.stock_items;
create policy stock_items_select on public.stock_items
  for select to authenticated
  using ((select public.erp_is_operator()));

drop policy if exists stock_kit_components_select on public.stock_kit_components;
create policy stock_kit_components_select on public.stock_kit_components
  for select to authenticated
  using ((select public.erp_is_operator()));

drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements
  for select to authenticated
  using ((select public.erp_is_operator()));

revoke all on function public.erp_is_operator() from public, anon;
grant execute on function public.erp_is_operator() to authenticated;

revoke all on function public.stock_require_operator() from public, anon, authenticated;
revoke all on function public.stock_balance_of(bigint) from public, anon, authenticated;
revoke all on function public.ean13_check_digit(text) from public, anon, authenticated;

revoke all on function public.stock_create_item(text, text, integer, integer, integer, jsonb) from public, anon;
grant execute on function public.stock_create_item(text, text, integer, integer, integer, jsonb) to authenticated;

revoke all on function public.stock_apply_scan(text, text, integer) from public, anon;
grant execute on function public.stock_apply_scan(text, text, integer) to authenticated;

revoke all on function public.stock_assemble(bigint, integer) from public, anon;
grant execute on function public.stock_assemble(bigint, integer) to authenticated;

revoke all on function public.stock_snapshot() from public, anon;
grant execute on function public.stock_snapshot() to authenticated;

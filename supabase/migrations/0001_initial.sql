create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists vector with schema extensions;

create table public.taxonomy_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  status text not null check (status in ('active', 'superseded', 'rolled_back')),
  model text not null,
  summary text not null,
  source_hash text not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create unique index one_active_taxonomy
  on public.taxonomy_versions ((status)) where status = 'active';

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  taxonomy_version_id uuid not null references public.taxonomy_versions(id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null,
  include_terms text[] not null default '{}',
  exclude_terms text[] not null default '{}',
  evidence_count integer not null check (evidence_count >= 0),
  unique (taxonomy_version_id, slug)
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source_updated_at timestamptz,
  fetched_count integer not null default 0,
  accepted_count integer not null default 0,
  review_count integer not null default 0,
  error_message text,
  constraint completed_run_has_finished_at check (
    (status = 'running' and finished_at is null) or
    (status <> 'running' and finished_at is not null)
  )
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references public.sync_runs(id) on delete cascade,
  source_kind text not null,
  source_id text not null,
  title text not null,
  description text,
  agency_name text not null,
  province text not null,
  method text not null check (method in ('e-bidding', 'e-market')),
  budget_baht numeric(16, 2) check (budget_baht is null or budget_baht >= 0),
  announced_at timestamptz not null,
  closes_at timestamptz not null,
  source_updated_at timestamptz,
  source_url text not null check (source_url ~ '^https://'),
  raw_fingerprint text not null,
  embedding extensions.vector(768),
  search_text text generated always as (
    title || ' ' || coalesce(description, '') || ' ' || agency_name
  ) stored,
  created_at timestamptz not null default now(),
  unique (sync_run_id, source_kind, source_id),
  check (closes_at > announced_at)
);

create index opportunities_sync_run on public.opportunities(sync_run_id);
create index opportunities_filters on public.opportunities(province, method, closes_at);
create index opportunities_search_trgm on public.opportunities using gin (search_text gin_trgm_ops);
create index opportunities_search_fts on public.opportunities using gin (to_tsvector('simple', search_text));
create index opportunities_embedding_hnsw on public.opportunities
  using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null;

create table public.classifications (
  opportunity_id uuid primary key references public.opportunities(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  confidence real not null check (confidence between 0 and 1),
  reason text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create table public.review_queue (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references public.sync_runs(id) on delete cascade,
  source_kind text not null,
  source_id text,
  title text,
  issue_code text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create view public.active_categories with (security_invoker = true) as
select c.slug, c.name, c.description, c.include_terms, c.exclude_terms, c.evidence_count
from public.categories c
join public.taxonomy_versions t on t.id = c.taxonomy_version_id
where t.status = 'active';

create view public.latest_sync_status with (security_invoker = true) as
select status, finished_at, source_updated_at, error_message, fetched_count, accepted_count, review_count
from public.sync_runs
where status in ('succeeded', 'failed')
order by finished_at desc
limit 1;

create or replace function public.publish_taxonomy(
  taxonomy_payload jsonb,
  model_name text,
  taxonomy_summary text,
  discovery_source_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version integer;
  new_version_id uuid;
begin
  if jsonb_array_length(taxonomy_payload) = 0 then
    raise exception 'taxonomy must contain at least one category';
  end if;

  select coalesce(max(version), 0) + 1 into next_version from taxonomy_versions;
  update taxonomy_versions set status = 'superseded' where status = 'active';
  insert into taxonomy_versions(version, status, model, summary, source_hash, activated_at)
  values (next_version, 'active', model_name, taxonomy_summary, discovery_source_hash, now())
  returning id into new_version_id;

  insert into categories(
    taxonomy_version_id, slug, name, description, include_terms, exclude_terms, evidence_count
  )
  select
    new_version_id,
    item->>'slug',
    item->>'name',
    item->>'description',
    array(select jsonb_array_elements_text(item->'includeTerms')),
    array(select jsonb_array_elements_text(item->'excludeTerms')),
    (item->>'evidenceCount')::integer
  from jsonb_array_elements(taxonomy_payload) item;

  return new_version_id;
end;
$$;

create or replace function public.search_open_opportunities(
  search_text text default null,
  province_filter text[] default null,
  category_filter text default null,
  agency_filter text default null,
  min_budget_filter numeric default null,
  max_budget_filter numeric default null,
  closes_before_filter timestamptz default null,
  sort_filter text default 'relevance',
  page_limit integer default 30,
  page_offset integer default 0
)
returns table (
  id uuid,
  source_id text,
  title text,
  description text,
  agency_name text,
  province text,
  method text,
  budget_baht numeric,
  announced_at timestamptz,
  closes_at timestamptz,
  source_updated_at timestamptz,
  source_url text,
  category_slug text,
  category_name text,
  confidence real,
  relevance real,
  total_count bigint
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with latest_snapshot as (
    select sr.id
    from sync_runs sr
    where sr.status = 'succeeded'
    order by sr.finished_at desc
    limit 1
  ), matches as (
    select
      o.*,
      c.slug as category_slug,
      c.name as category_name,
      cl.confidence,
      case
        when search_text is null or btrim(search_text) = '' then cl.confidence * 10
        else cl.confidence * 10
          + ts_rank(to_tsvector('simple', o.search_text), websearch_to_tsquery('simple', search_text)) * 8
          + similarity(o.search_text, search_text) * 4
      end::real as relevance
    from opportunities o
    join latest_snapshot s on s.id = o.sync_run_id
    join classifications cl on cl.opportunity_id = o.id
    join categories c on c.id = cl.category_id
    join taxonomy_versions tv on tv.id = c.taxonomy_version_id and tv.status = 'active'
    where o.closes_at > now()
      and o.method in ('e-bidding', 'e-market')
      and cl.confidence >= 0.90
      and (province_filter is null or o.province = any(province_filter))
      and (category_filter is null or c.slug = category_filter)
      and (agency_filter is null or o.agency_name ilike '%' || agency_filter || '%')
      and (min_budget_filter is null or o.budget_baht >= min_budget_filter)
      and (max_budget_filter is null or o.budget_baht <= max_budget_filter)
      and (closes_before_filter is null or o.closes_at <= closes_before_filter)
      and (
        search_text is null or btrim(search_text) = '' or
        to_tsvector('simple', o.search_text) @@ websearch_to_tsquery('simple', search_text) or
        o.search_text ilike '%' || search_text || '%'
      )
  )
  select
    m.id, m.source_id, m.title, m.description, m.agency_name, m.province, m.method,
    m.budget_baht, m.announced_at, m.closes_at, m.source_updated_at, m.source_url,
    m.category_slug, m.category_name, m.confidence, m.relevance,
    count(*) over() as total_count
  from matches m
  order by
    case when sort_filter = 'budget' then m.budget_baht end desc nulls last,
    case when sort_filter = 'newest' then m.announced_at end desc,
    case when sort_filter = 'relevance' then m.relevance end desc,
    case when sort_filter = 'relevance' then m.closes_at end asc,
    m.id
  limit least(greatest(page_limit, 1), 100)
  offset least(greatest(page_offset, 0), 10000);
$$;

alter table public.taxonomy_versions enable row level security;
alter table public.categories enable row level security;
alter table public.sync_runs enable row level security;
alter table public.opportunities enable row level security;
alter table public.classifications enable row level security;
alter table public.review_queue enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on function public.search_open_opportunities from public, anon, authenticated;
grant execute on function public.search_open_opportunities to service_role;
revoke execute on function public.publish_taxonomy from public, anon, authenticated;
grant execute on function public.publish_taxonomy to service_role;

-- NeuroNest AI Core V2 production schema.
-- Run in the Supabase SQL editor. Backend access must use SUPABASE_SERVICE_ROLE_KEY.
-- No anonymous/public policies are created; user isolation remains server enforced.

create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.neuronest_users (
  id text primary key,
  google_sub text unique,
  email text not null unique,
  name text,
  picture text,
  status text not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.memories (
  id text primary key,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  type text not null,
  title text not null,
  content text not null default '',
  summary text not null default '',
  tags text[] not null default '{}',
  emotions text[] not null default '{}',
  importance_score numeric not null default 0,
  ai_score numeric not null default 0,
  location jsonb,
  media jsonb,
  metadata jsonb not null default '{}'::jsonb,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists memories_user_created_idx on public.memories(user_id, created_at desc);
create index if not exists memories_user_type_idx on public.memories(user_id, type);

create table if not exists public.memory_vectors (
  id text primary key,
  memory_id text not null,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  embedding vector(1536) not null,
  type text not null,
  provider text not null default 'openai',
  model text not null default 'text-embedding-3-small',
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memory_vectors add column if not exists provider text not null default 'openai';
alter table public.memory_vectors add column if not exists model text not null default 'text-embedding-3-small';
alter table public.memory_vectors add column if not exists content_hash text;
alter table public.memory_vectors add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'memory_vectors_memory_id_fkey'
      and conrelid = 'public.memory_vectors'::regclass
  ) then
    alter table public.memory_vectors drop constraint memory_vectors_memory_id_fkey;
  end if;
end $$;

create index if not exists memory_vectors_user_idx on public.memory_vectors(user_id);
create index if not exists memory_vectors_embedding_idx
  on public.memory_vectors using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table if not exists public.media_records (
  id text primary key,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  memory_id text references public.memories(id) on delete cascade,
  kind text not null check (kind in ('screenshot', 'voice', 'image', 'file')),
  storage_provider text not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  transcript text,
  extracted_text text,
  ai_description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_chats (
  id text primary key,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  language text,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.timeline_events (
  id text primary key,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  memory_id text references public.memories(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  event_at timestamptz not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.place_memories (
  id text primary key,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  memory_id text references public.memories(id) on delete set null,
  place_id text,
  place_name text,
  category text,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  arrival_time timestamptz not null,
  departure_time timestamptz not null,
  duration_minutes integer not null,
  rating numeric,
  website text,
  opening_hours jsonb,
  photo_url text,
  source text not null default 'AUTOMATIC',
  metadata_status text not null default 'pending',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists place_memories_user_departure_idx on public.place_memories(user_id, departure_time desc);
create index if not exists place_memories_user_place_idx on public.place_memories(user_id, place_id);
create index if not exists place_memories_user_category_idx on public.place_memories(user_id, category);

create table if not exists public.relationships (
  id text primary key,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  person_name text not null,
  relationship_type text not null default 'Unknown',
  first_seen timestamptz,
  last_seen timestamptz,
  interaction_count integer not null default 0,
  interaction_frequency numeric not null default 0,
  relationship_strength numeric not null default 0,
  positive_score numeric not null default 0,
  negative_score numeric not null default 0,
  emotional_impact jsonb not null default '{}'::jsonb,
  trust_score numeric not null default 0,
  importance_score numeric not null default 0,
  reconnect_score numeric not null default 0,
  relationship_status text not null default 'Weak',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relationship_events (
  id text primary key,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  relationship_id text references public.relationships(id) on delete cascade,
  source_type text not null,
  source_id text,
  interaction_type text not null default 'mention',
  sentiment text not null default 'neutral',
  timestamp timestamptz not null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.relationship_insights (
  id text primary key,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  relationship_id text references public.relationships(id) on delete cascade,
  insight_type text not null,
  insight_text text not null,
  confidence numeric not null default 0,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.relationship_clusters (
  id text primary key,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  cluster_name text not null,
  members jsonb not null default '[]'::jsonb,
  confidence numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists relationships_user_strength_idx on public.relationships(user_id, relationship_strength desc);
create index if not exists relationships_user_last_seen_idx on public.relationships(user_id, last_seen desc);
create index if not exists relationship_events_user_timestamp_idx on public.relationship_events(user_id, timestamp desc);
create index if not exists relationship_events_relationship_idx on public.relationship_events(relationship_id, timestamp desc);
create index if not exists relationship_insights_user_confidence_idx on public.relationship_insights(user_id, confidence desc);
create index if not exists relationship_clusters_user_confidence_idx on public.relationship_clusters(user_id, confidence desc);

create table if not exists public.goals (
  id text primary key,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'active',
  progress numeric not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intelligence_records (
  id text primary key,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  type text not null check (type in ('digital-twin', 'relationship-graph', 'prediction', 'replay', 'insight', 'learning-profile')),
  version text,
  evidence_count integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.predictions (
  id text primary key,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  type text not null,
  title text not null,
  summary text not null default '',
  confidence numeric not null default 0,
  evidence jsonb not null default '[]'::jsonb,
  evidence_count integer not null default 0,
  prediction_score numeric not null default 0,
  risk_level text not null default 'Low',
  status text not null default 'active',
  generated_at timestamptz not null default now(),
  valid_until timestamptz,
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.prediction_models (
  id text primary key,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  model_type text not null,
  evidence_count integer not null default 0,
  prediction_count integer not null default 0,
  average_confidence numeric not null default 0,
  average_score numeric not null default 0,
  updated_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.prediction_history (
  id text primary key,
  user_id text not null references public.neuronest_users(id) on delete cascade,
  prediction_id text,
  prediction_type text not null,
  outcome text not null default 'unknown',
  success boolean not null default false,
  confidence numeric not null default 0,
  evidence jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create index if not exists predictions_user_type_idx on public.predictions(user_id, type);
create index if not exists predictions_user_generated_idx on public.predictions(user_id, generated_at desc);
create index if not exists predictions_user_risk_idx on public.predictions(user_id, risk_level);
create index if not exists prediction_models_user_type_idx on public.prediction_models(user_id, model_type);
create index if not exists prediction_history_user_evaluated_idx on public.prediction_history(user_id, evaluated_at desc);

create table if not exists public.ai_usage (
  id text primary key,
  user_id text references public.neuronest_users(id) on delete set null,
  capability text not null,
  provider text,
  model text,
  status text not null,
  latency_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_created_idx on public.ai_usage(created_at desc);
create index if not exists intelligence_records_user_type_idx on public.intelligence_records(user_id, type);

create or replace function public.match_memory_vectors(
  match_user_id text,
  query_embedding vector(1536),
  match_count int default 8
)
returns table (
  id text,
  memory_id text,
  user_id text,
  type text,
  similarity float
)
language sql stable
as $$
  select
    memory_vectors.id,
    memory_vectors.memory_id,
    memory_vectors.user_id,
    memory_vectors.type,
    1 - (memory_vectors.embedding <=> query_embedding) as similarity
  from public.memory_vectors
  where memory_vectors.user_id = match_user_id
  order by memory_vectors.embedding <=> query_embedding
  limit match_count;
$$;

alter table public.neuronest_users enable row level security;
alter table public.memories enable row level security;
alter table public.memory_vectors enable row level security;
alter table public.media_records enable row level security;
alter table public.ai_chats enable row level security;
alter table public.timeline_events enable row level security;
alter table public.place_memories enable row level security;
alter table public.relationships enable row level security;
alter table public.relationship_events enable row level security;
alter table public.relationship_insights enable row level security;
alter table public.relationship_clusters enable row level security;
alter table public.goals enable row level security;
alter table public.intelligence_records enable row level security;
alter table public.predictions enable row level security;
alter table public.prediction_models enable row level security;
alter table public.prediction_history enable row level security;
alter table public.ai_usage enable row level security;

insert into storage.buckets (id, name, public)
values ('neuronest-media', 'neuronest-media', false)
on conflict (id) do nothing;

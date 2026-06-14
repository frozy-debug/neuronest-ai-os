-- NeuroNest AI Second Brain vector memory schema.
-- Run this in the Supabase SQL editor after enabling the vector extension.

create extension if not exists vector;

create table if not exists public.memory_vectors (
  id text primary key,
  memory_id text not null,
  user_id text not null,
  embedding vector(1536) not null,
  type text not null,
  created_at timestamptz default now()
);

create index if not exists memory_vectors_user_idx
  on public.memory_vectors (user_id);

create index if not exists memory_vectors_embedding_idx
  on public.memory_vectors
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

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

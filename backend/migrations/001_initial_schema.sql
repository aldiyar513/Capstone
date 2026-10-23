begin;

create table public.pieces (
    id uuid primary key default gen_random_uuid(),

    owner_id uuid not null
        references auth.users(id) on delete cascade,

    title text not null
        check (length(trim(title)) > 0),

    instrument text not null
        check (length(trim(instrument)) > 0),

    description text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.recordings (
    id uuid primary key default gen_random_uuid(),

    piece_id uuid not null
        references public.pieces(id) on delete cascade,

    title text not null
        check (length(trim(title)) > 0),

    storage_key text not null unique,
    original_filename text not null,
    content_type text not null,

    size_bytes bigint not null
        check (size_bytes > 0),

    duration_ms integer
        check (duration_ms >= 0),

    upload_status text not null default 'pending'
        check (upload_status in ('pending', 'ready', 'failed')),

    created_at timestamptz not null default now()
);

create table public.comments (
    id uuid primary key default gen_random_uuid(),

    recording_id uuid not null
        references public.recordings(id) on delete cascade,

    author_id uuid not null
        references auth.users(id) on delete cascade,

    timestamp_ms integer not null
        check (timestamp_ms >= 0),

    body text not null
        check (length(trim(body)) > 0),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index pieces_owner_id_idx
    on public.pieces(owner_id);

create index recordings_piece_created_idx
    on public.recordings(piece_id, created_at desc);

create index comments_recording_timestamp_idx
    on public.comments(recording_id, timestamp_ms);

create index comments_author_id_idx
    on public.comments(author_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger pieces_set_updated_at
before update on public.pieces
for each row
execute function public.set_updated_at();

create trigger comments_set_updated_at
before update on public.comments
for each row
execute function public.set_updated_at();

alter table public.pieces enable row level security;
alter table public.recordings enable row level security;
alter table public.comments enable row level security;

commit;
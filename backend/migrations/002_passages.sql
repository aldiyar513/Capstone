begin;

create table public.passages (
    id uuid primary key default gen_random_uuid(),

    recording_id uuid not null
        references public.recordings(id) on delete cascade,

    label text not null
        check (length(trim(label)) between 1 and 120),

    start_ms integer not null
        check (start_ms >= 0),

    end_ms integer not null,

    note text not null default ''
        check (length(note) <= 5000),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint passages_valid_range
        check (end_ms > start_ms)
);

create index passages_recording_start_idx
    on public.passages(recording_id, start_ms);

create trigger passages_set_updated_at
before update on public.passages
for each row
execute function public.set_updated_at();

alter table public.passages enable row level security;

commit;
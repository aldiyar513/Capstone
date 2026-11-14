begin;

-- Prevent writes while existing passage notes are migrated.
lock table public.passages in share row exclusive mode;
lock table public.comments in share row exclusive mode;

-- Existing timestamped comments remain valid.
alter table public.comments
    add column passage_id uuid
    references public.passages(id)
    on delete set null;

create index comments_passage_id_idx
    on public.comments(passage_id)
    where passage_id is not null;

-- Move existing passage notes into comments.
-- Current passages are personal, so their author is the piece owner.
insert into public.comments (
    recording_id,
    author_id,
    timestamp_ms,
    body,
    passage_id,
    created_at,
    updated_at
)
select
    pa.recording_id,
    p.owner_id,
    pa.start_ms,
    pa.note,
    pa.id,
    pa.created_at,
    pa.updated_at
from public.passages as pa
join public.recordings as r
    on r.id = pa.recording_id
join public.pieces as p
    on p.id = r.piece_id
where length(trim(pa.note)) > 0;

-- Clear the old copies only after the insert succeeds.
-- Keep the column temporarily so the existing API still works.
update public.passages
set note = ''
where note <> '';

commit;